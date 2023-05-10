const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser');

const app = express();

app.use(cookieParser());

const port = 6789;

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
app.get('/', (req, res) => res.render('index'));

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
    res.render('chestionar', {intrebari: listaIntrebari});
    });
});

app.post('/rezultat-chestionar', (req, res) => {
    const raspunsuriCorecte = [0, 3, 3, 3, 1, 0, 3, 3];
    const raspunsuriUser = Object.values(req.body);
    if (raspunsuriUser.length != raspunsuriCorecte.length) {
        res.status(400).send("Error 400: You must answer to all questions!");
        return;
    }
    res.render('rezultat-chestionar', {raspunsuriU: raspunsuriUser, raspunsuriC: raspunsuriCorecte});

    //console.log(req.body);
});

app.get('/autentificare', (req, res) => {
    
    
    res.render('autentificare');

    
    
});

app.post('/verificare-autentificare', (req, res) => {
    
    const fs = require('fs');

    //citire conturi din fisier
    fs.readFile('public\\conturi.json', 'utf8', (err, data) => {
    if (err) {
        console.error(err);
        return;
    }
    const conturiJSON = JSON.parse(data);

    //citire cont input utilizator
    const contIntrodus = Object.values(req.body);

    //console.log(conturiJSON);
    //console.log(contIntrodus);

    res.render('verificare-autentificare', {contIntrodus: contIntrodus, conturiJSON:conturiJSON});
    });
});

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:` + port));