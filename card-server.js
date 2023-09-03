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
// Should only be called by a cabinet
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
                    if (user.credits > db.low_balance) {
                        res.status(200).send(user.credits.toString());
                    } else {
                        res.status(201).send(user.credits.toString());
                    }
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
// Called by POS
app.get('/topup_card/:card/:credits', (req, res) => {
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
app.get('/topup/:user/:credits', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                let user = db.users[req.params.user];
                user.credits = user.credits + parseFloat(req.params.credits);
                db.users[req.params.user] = user;
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                res.status(200).send(user.credits.toString());
                console.log(`User TopUp: ${db.cards[req.params.card].user} : New Balance = ${user.credits}`)
            } else {
                res.status(404).end();
                console.log(`Unknown Card: ${req.params.user}`)
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Called by POS
app.get('/balance_card/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.cards[req.params.card].locked === false &&
                db.users[db.cards[req.params.card].user]) {
                let user = db.users[db.cards[req.params.card].user];
                res.status(200).send(user.credits.toString());
            } else {
                res.status(404).end();
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/balance/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                let user = db.users[req.params.user];
                res.status(200).send(user.credits.toString());
            } else {
                res.status(404).end();
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Register new User
app.get('/create/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] === undefined) {
                let user = {
                    credits: 0
                }
                db.users[req.params.user] = user;
                res.status(200).send("Registered");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`User Created: ${req.params.user}`)
            } else {
                res.status(400);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Register new card
app.get('/create/:user/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined &&
                db.cards[req.params.card] === undefined) {
                let card = {
                    user: req.params.user,
                    locked: false
                }
                db.cards[req.params.card] = card;
                res.status(200).send("Registered Card");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`New Card Created: ${req.params.card} for ${req.params.user}`)
            } else {
                res.status(400);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Transfer user card
app.get('/create/:user/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined &&
                db.cards[req.params.card] !== undefined) {
                let card = {
                    user: req.params.user,
                    locked: false
                }
                db.cards[req.params.card] = card;
                res.status(200).send("Moved Card");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`Card Moved: ${req.params.card} for ${req.params.user}`)
            } else {
                res.status(400);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Card Management
app.get('/lock/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                let card = db.cards[req.params.card]
                card.locked = true;
                db.cards[req.params.card] = card;
                res.status(200).send("Locked Card");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`Card Locked: ${req.params.card}`)
            } else {
                res.status(400);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/unlock/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                let card = db.cards[req.params.card]
                card.locked = false;
                db.cards[req.params.card] = card;
                res.status(200).send("Unlocked Card");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`Card Unlocked: ${req.params.card}`)
            } else {
                res.status(400);
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
