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

// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'Hello World'
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res
app.get('/', (req, res) => {
    const usernameCookie = req.cookies.usernameCookie;

    con.query('SELECT * FROM produse', function (error, results) {
        if (error) {
            console.error('Error fetching data from "produse" table:', error);
            res.status(500).send('Internal Server Error');
            return;
        }

        const isLoggedIn = req.session.usernameSession ? true : false;

        if (req.session.contSession) {
            var isAdmin = req.session.contSession.rol === "admin" ? true : false; 
        }

        res.render('index.ejs', { usernameCookie: usernameCookie, produse: results, userLoggedIn: isLoggedIn, isAdmin: isAdmin });
    });
});
// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată
app.get('/chestionar', (req, res) => {
    const fs = require('fs');

    //citire intrebari din fisier
    fs.readFile('public\\intrebari.json', 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }
        const listaIntrebari = JSON.parse(data);
        //console.log(listaIntrebari);

        // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' care conține vectorul de întrebări
        res.render('chestionar', { intrebari: listaIntrebari });
    });
});

app.post('/rezultat-chestionar', (req, res) => {
    const raspunsuriCorecte = [0, 3, 3, 3, 1, 0, 3, 3];
    const raspunsuriUser = Object.values(req.body);
    if (raspunsuriUser.length != raspunsuriCorecte.length) {
        res.status(400).send("Error 400: You must answer to all questions!");
        return;
    }
    res.render('rezultat-chestionar', { raspunsuriU: raspunsuriUser, raspunsuriC: raspunsuriCorecte });

    //console.log(req.body);
});

app.get('/autentificare', (req, res) => {

    const cookieError = req.cookies.mesajEroareCookie;
    res.render('autentificare', { cookieError: cookieError });
});

app.post('/verificare-autentificare', (req, res) => {

    const fs = require('fs');

    //citire conturi din fisier
    fs.readFile('public\\utilizatori.json', 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }
        const conturiJSON = JSON.parse(data);

        //citire cont input utilizator
        const contIntrodus = Object.values(req.body);

        //console.log(conturiJSON);
        //console.log(contIntrodus);

        const numeContIntrodus = contIntrodus[0];
        const parolaContIntrodus = contIntrodus[1];
        for (var i = 0; i < conturiJSON.length; i++) {
            var cont = conturiJSON[i];

            if (cont.username === numeContIntrodus && cont.password === parolaContIntrodus) {
                res.cookie('usernameCookie', numeContIntrodus);
                res.clearCookie('mesajEroareCookie');

                const contLogat = conturiJSON[i];
                // Exclude the password property from the contLogat object
                const { password, ...contLogatFaraParola } = contLogat;
                req.session.contSession = contLogatFaraParola;
                req.session.usernameSession = contLogat.username;

                //console.log(contLogatFaraParola);
                res.redirect('http://localhost:6789/');

                return;
            } else if (i == conturiJSON.length - 1) {
                res.cookie('mesajEroareCookie', 'Date incorecte.');
                req.session.destroy();
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
        if (err) throw err;
        console.log("Connected!");

        con.query("CREATE DATABASE IF NOT EXISTS cumparaturi", function (err, result) {
            if (err) {
                if (error.code === 'ER_DB_CREATE_EXISTS') {
                    console.log('Database "cumparaturi" already exists');
                } else {
                    console.error('Error creating database:', error);
                }
            }
            console.log("Database created");
        });

        var sql = "CREATE TABLE IF NOT EXISTS produse (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL, price DECIMAL(10, 2) NOT NULL, description TEXT)";
        con.query(sql, function (err, result) {
            if (err) {
                if (error.code === 'ER_TABLE_EXISTS_ERROR') {
                    console.log('Table "produse" already exists');
                } else {
                    console.error('Error creating table:', error);
                }
            }
            console.log("Table created");
        });
    });

    res.redirect('/');
});

app.get('/inserare-bd', (req, res) => {
    const products = [
        { name: 'Product 1', price: 10.99, description: 'Description of Product 1' },
        { name: 'Product 2', price: 19.99, description: 'Description of Product 2' },
        { name: 'Product 3', price: 24.99, description: 'Description of Product 3' }
    ];

    con.connect(function (err) {
        if (err) throw err;
        console.log("Connected!");

        // Iterate over the products array and insert each product into the table
        products.forEach((product) => {
            con.query('INSERT INTO produse SET ?', product, (error, results, fields) => {
                if (error) {
                    console.error('Error inserting product:', error);
                    return;
                }
                console.log('Product inserted successfully');
            });
        });
    });

    res.redirect('/');
});

app.post('/adaugare_cos', function (req, res) {
    const idProdus = req.body.id;

    let cos = req.session.cos || [];
    cos.push(idProdus);
    req.session.cos = cos;

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
                console.error(error);
                res.sendStatus(500);
                return;
            }
            res.render('vizualizare-cos.ejs', { produseCos: results, cantitateProduse: cantitateProduse });
        });
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
    console.log(produs);
    const productName = produs[0]; // Get the product name from the request body
    const productPrice = produs[1]; // Get the price from the request body
    const productDescription = produs[2]; // Get the price from the request body

    const sql = 'INSERT INTO produse (name, price, description) VALUES (?, ?, ?)';
    con.query(sql, [productName, productPrice, productDescription], function (error, results) {
        if (error) {
            console.error('Error adding product:', error);
            res.sendStatus(500);
            return;
        } else {
            console.log('Product inserted successfully');
            res.redirect('/');
        }
    });
});

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:` + port));