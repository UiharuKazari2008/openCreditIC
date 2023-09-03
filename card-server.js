const express = require('express');
const app = express();
const port = 1777;
let db = require('./cards.json')
const fs = require("fs");

let saveTimeout
function saveDatabase() {
    try {
        fs.writeFileSync("./cards.json", JSON.stringify(db));
    } catch (e) {
        console.error("Failed to save cards database", e)
    }
}
app.get('/', (req, res) => {
    res.status(200).send("READY");
});
app.get('/dispense/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.cards[req.params.card].locked === false &&
                db.users[db.cards[req.params.card].user]) {
                let user = db.users[db.cards[req.params.card].user];
                if ((user.credits - db.cost) >= 0) {
                    user.credits = user.credits - db.cost
                    db.users[db.cards[req.params.card].user] = user;
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(saveDatabase, 5000);
                    res.status(200).send(user.credits.toString());
                    console.log(`Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : New Balance = ${user.credits}`)
                } else {
                    res.status(400).end("DECLINED");
                    console.log(`Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : Not Enough Credits`)
                }
            } else {
                res.status(404).end();
                console.log(`Unknown Card: ${req.params.card}`)
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/topup/:card/:credits', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.users[db.cards[req.params.card].user]) {
                let user = db.users[db.cards[req.params.card].user];
                user.credits = user.credits + parseFloat(req.params.credits);
                db.users[db.cards[req.params.card].user] = user;
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                res.status(200).send(user.credits.toString());
                console.log(`Card TopUp: ${req.params.card} for ${db.cards[req.params.card].user} : New Balance = ${user.credits}`)
            } else {
                res.status(404).end();
                console.log(`Unknown Card: ${req.params.card}`)
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/balance/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.cards[req.params.card].locked === false &&
                db.users[db.cards[req.params.card].user]) {
                let user = db.users[db.cards[req.params.card].user];
                res.status(200).send(user.credits.toString());
            } else {
                res.status(404);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
