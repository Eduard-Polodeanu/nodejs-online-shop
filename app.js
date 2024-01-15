const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mysql = require('mysql2');
const { createUnzip } = require('zlib');

const app = express();

const port = 6789;

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "parola",
    database: "cumparaturi",
    insecureAuth: "true"
});

app.use(cookieParser());

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

app.use((req, res, next) => {
    res.locals.usernameSession = req.session.usernameSession;
    res.locals.contSession = req.session.contSession;
    res.locals.cos = req.session.cos;
    next();
});


// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views/layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client (e.g., fișiere css, javascript, imagini)
app.use(express.static('public'))
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body
app.use(bodyParser.json());
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));


const blockedIPs = new Map();  //variabila globala folosita pentru a stoca incercarile de a accesa resurse neexistente si timpul de timeout pentru fiecare adresa ip
const maxFailedResourceAttempts = 3;
const maxFailedLoginAttempts = 3;
const unblockTimeoutDuration = 0.25 * 60 * 1000; // 0.25 minute durata pentru deblocarea ip-ului banat

app.all("*", (req, res, next) => {
    const { ip } = req;

    if (blockedIPs.has(ip)) { // verific daca ip-ul curent este blocat 
        const { failedResourceAttempts, failedLoginAttempts, unblockTimeout } = blockedIPs.get(ip);

        if (failedResourceAttempts >= maxFailedResourceAttempts) {
            return res.status(403).send("Acces blocat din cauza numărului excesiv de încercări eșuate de a accesa o resursă neexistentă.");
        }

        if (failedLoginAttempts >= maxFailedLoginAttempts) {
            return res.status(408).send("Acces blocat din cauza numărului excesiv de încercări eșuate de autentificare.");
        }

        clearTimeout(unblockTimeout); // resetez timeout-ul
    }

    next();
});

app.get('/', (req, res) => {
    const usernameCookie = req.cookies.usernameCookie;

    con.connect(function (err) {
        if (err) {
            res.status(500).send('Internal Server Error: Eroare la conectarea la baze de date');
            throw err;
        }

        con.query('SELECT * FROM produse', function (error, results) {  // accesarea tabelei pentru afisarea listei de produse
            if (error) {
                console.error('Eroare la accesarea datelor din tabela "produse":', error);
                res.status(501).send('Internal Server Error: Eroare la accesarea datelor din tabela "produse"');
                return;
            }

            const isLoggedIn = req.session.usernameSession ? true : false;

            if (req.session.contSession) {
                var isAdmin = req.session.contSession.rol === "admin" ? true : false;
            }

            res.render('index.ejs', { usernameCookie: usernameCookie, produse: results, userLoggedIn: isLoggedIn, isAdmin: isAdmin });
        });
    });
});

app.get('/chestionar', (req, res) => {
    const fs = require('fs');

    fs.readFile('public\\intrebari.json', 'utf8', (err, data) => {
        if (err) {
            res.status(505).send('Internal Server Error: Eroare la citirea fisierului');
            throw err;
        }

        const listaIntrebari = JSON.parse(data);

        res.render('chestionar', { intrebari: listaIntrebari });
    });
});

app.post('/rezultat-chestionar', (req, res) => {
    const raspunsuriCorecte = [0, 3, 3, 3, 1, 0, 3, 3];
    const raspunsuriUser = Object.values(req.body);

    if (raspunsuriUser.length != raspunsuriCorecte.length) {
        res.status(400).send("Client Error: Trebuie să răspundeți la toate întrebările!");
        return;
    }

    res.render('rezultat-chestionar', { raspunsuriU: raspunsuriUser, raspunsuriC: raspunsuriCorecte });
});

app.get('/autentificare', (req, res) => {
    res.clearCookie('mesajEroareCookie');   // stergere cookie cu mesajul de eroare de la incercarile anterioare
    const cookieError = req.cookies.mesajEroareCookie;

    res.render('autentificare', { cookieError: cookieError });
});

app.post('/verificare-autentificare', (req, res) => {
    const { ip } = req;
    const fs = require('fs');

    fs.readFile('public\\utilizatori.json', 'utf8', (err, data) => {    // citire lista conturi din fisier
        if (err) {
            console.error(err);
            return;
        }

        const conturiJSON = JSON.parse(data);
        const contIntrodus = Object.values(req.body);   // citire cont input utilizator
        const numeContIntrodus = contIntrodus[0];
        const parolaContIntrodus = contIntrodus[1];

        for (var i = 0; i < conturiJSON.length; i++) {  // verificare date introduse cu fiecare cont din fisier 
            var cont = conturiJSON[i];

            if (cont.username === numeContIntrodus && cont.password === parolaContIntrodus) {
                res.cookie('usernameCookie', numeContIntrodus); // creare cookie cu numele contului autentificat

                const { password, ...contLogatFaraParola } = cont;  // stochez, fara parola, contul curent in variabila contLogatFaraParola
                req.session.contSession = contLogatFaraParola;
                req.session.usernameSession = cont.username;

                res.redirect('http://localhost:6789/');
                return;

            } else if (i == conturiJSON.length - 1) {   // 
                res.cookie('mesajEroareCookie', 'Date incorecte.'); // setare cookie cu mesajul de eroare

                // variabile pentru a gestiona timeout-ul in caz de incercari nereusite multiple
                let { failedLoginAttempts, unblockTimeout } = blockedIPs.get(ip) || { failedLoginAttempts: 0, unblockTimeout: null };
                failedLoginAttempts++;

                if (failedLoginAttempts >= maxFailedLoginAttempts) {    // blochez ip-ul curent si setez setez timeout-ul
                    const unblockTimeout = setTimeout(() => {
                        blockedIPs.delete(ip);
                    }, unblockTimeoutDuration);
                    blockedIPs.set(ip, { failedLoginAttempts, unblockTimeout });
                } else {
                    blockedIPs.set(ip, { failedLoginAttempts, unblockTimeout });
                }

                res.redirect('http://localhost:6789/autentificare');
            }
        }

    });
});

app.post('/logout', (req, res) => {
    res.clearCookie('usernameCookie');
    req.session.destroy();

    res.redirect('/');
});

app.get('/creare-bd', (req, res) => {
    con.connect(function (err) {
        if (err) {
            res.status(500).send('Internal Server Error: Eroare la conectarea la baze de date');
            throw err;
        }

        con.query("CREATE DATABASE IF NOT EXISTS cumparaturi", function (err) {
            if (err) {
                if (error.code === 'ER_DB_CREATE_EXISTS') {
                    console.log('Baza de date "cumparaturi" există deja!');
                } else {
                    console.error('Eroare la crearea bazei de date:', err);
                }
                res.status(502).send('Internal Server Error: Eroare la crearea bazei de date');
            }
            console.log("Baza de date a fost creată cu succes!");
        });

        var sql = "CREATE TABLE IF NOT EXISTS produse (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL, price DECIMAL(10, 2) NOT NULL, description TEXT)";
        con.query(sql, function (err) {
            if (err) {
                if (error.code === 'ER_TABLE_EXISTS_ERROR') {
                    console.log('Tabela "produse" există deja!');
                } else {
                    console.error('Eroare la crearea tabelei:', err);
                }
                res.status(503).send('Internal Server Error: Eroare la crearea tabelei');
            }
            console.log("Tabelă creată cu succes!");
        });
    });

    res.redirect('/');
});

app.get('/inserare-bd', (req, res) => {
    const products = [
        { name: 'Produs 1', price: 10.99, description: 'Descriere produs 1' },
        { name: 'Produs 2', price: 19.99, description: 'Descriere produs 2' },
        { name: 'Produs 3', price: 24.99, description: 'Descriere produs 3' }
    ];

    con.connect(function (err) {
        if (err) {
            res.status(500).send('Internal Server Error: Eroare la conectarea la baze de date');
            throw err;
        }

        products.forEach((product) => {
            con.query('INSERT INTO produse SET ?', product, (error) => {
                if (error) {
                    res.status(504).send('Internal Server Error: Eroare la inserarea produselor');
                    throw error;
                }
                console.log('Produs inserat cu succes!');
            });
        });
    });

    res.redirect('/');
});

app.post('/adaugare_cos', function (req, res) {
    const idProdus = req.body.id;   // id-ul produsului selectat din form 

    let cos = req.session.cos || [];    // initializare lista sau primeste produsele din session daca este cazul
    cos.push(idProdus); // adauga id-ul produsului curent
    req.session.cos = cos;  // actualizeaza cosul

    res.redirect('/');
});

app.get('/vizualizare-cos', function (req, res) {
    const cos = req.session.cos;

    const cantitateProduse = {};
    if (cos) {
        cos.forEach(function (produsId) {
            if (cantitateProduse[produsId]) {
                cantitateProduse[produsId]++;
            } else {
                cantitateProduse[produsId] = 1;
            }
        });

        con.query('SELECT * FROM produse WHERE id IN (?)', [cos], function (error, results) {
            if (error) {
                res.status(506).send('Internal Server Error: Eroare la selectarea produselor din cos');
                throw error;
            }
            res.render('vizualizare-cos.ejs', { produseCos: results, cantitateProduse: cantitateProduse });
        });
    } else {
        res.redirect('/');
    }
});

app.get('/admin', function (req, res) {
    const cont = req.session.contSession;
    if (cont) {
        var privilege = req.session.contSession.rol;
    }

    const isLoggedIn = req.session.usernameSession ? true : false;

    if (isLoggedIn && privilege) {
        if (privilege === "admin") {
            res.render('admin.ejs', {});
        } else {
            res.redirect('/');
        }
    }
});

app.post('/admin', function (req, res) {
    const produs = Object.values(req.body);
    const productName = produs[0];
    const productPrice = produs[1];
    const productDescription = produs[2];

    const sql = 'INSERT INTO produse (name, price, description) VALUES (?, ?, ?)';
    con.query(sql, [productName, productPrice, productDescription], function (error, results) {
        if (error) {
            res.status(504).send('Internal Server Error: Eroare la inserarea produselor');
            throw error;
        } else {
            console.log('Produs inserat cu succes!');
            res.redirect('/');
        }
    });
});

app.all("*", (req, res, next) => {
    const { ip } = req;

    if (res.status(404)) {   // verific daca resursa ceruta este valida, iar dupa incercari multiple de accesare, blochez accesul
        let { failedResourceAttempts, unblockTimeout } = blockedIPs.get(ip) || { failedResourceAttempts: 0, unblockTimeout: null };
        failedResourceAttempts++;

        if (failedResourceAttempts >= maxFailedResourceAttempts) {    // blochez ip-ul curent si setez setez timeout-ul
            const unblockTimeout = setTimeout(() => {
                blockedIPs.delete(ip);
            }, unblockTimeoutDuration);
            blockedIPs.set(ip, { failedResourceAttempts, unblockTimeout });
        } else {
            blockedIPs.set(ip, { failedResourceAttempts, unblockTimeout });
        }

        return res.status(404).send("Resursa cerută nu există.");
    }

    blockedIPs.delete(ip);  // resursa ceruta exista si scot ip-ul curent din lista de ip-uri blocate

    next();
});


app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:` + port));

// mysql80 service must run to connect to db
// node app.js