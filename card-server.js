const fs = require("fs");
const express = require('express');
const app = express();
const port = 1777;
if (!fs.existsSync('./cards.json')) {
    fs.writeFileSync("./cards.json", JSON.stringify({
        cost: 1,
        free_play: false,
        low_balance: 5,
        users: {},
        cards: {},
        machines: {}
    }), null, 2);
}
let db = require('./cards.json');
if (!fs.existsSync('./history.json')) {
    fs.writeFileSync("./history.json", JSON.stringify({
        dispense_log: {},
        topup_log: {},
        cards: {}
    }), null, 2);
}
let history = require('./history.json');

let saveTimeout
function saveDatabase() {
    try {
        fs.writeFileSync("./cards.json", JSON.stringify(db), null, 2);
    } catch (e) {
        console.error("Failed to save cards database", e)
    }
    try {
        fs.writeFileSync("./history.json", JSON.stringify(history), null, 2);
    } catch (e) {
        console.error("Failed to save history logs", e)
    }
}
app.get('/', (req, res) => {
    res.status(200).send("FastPay Server Beta");
});
// Should only be called by a cabinet
app.get(['/dispense/:machine_id/:card', '/withdraw/:machine_id/:card'], (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                !db.cards[req.params.card].locked &&
                db.users[db.cards[req.params.card].user] !== undefined &&
                !db.users[db.cards[req.params.card].user].locked) {
                let user = db.users[db.cards[req.params.card].user];
                const machine = db.machines[req.params.machine_id] || {}
                const cost = (() => {
                    if (machine && machine.free_play)
                        return [0, true]
                    if (db.free_play)
                        return [0, true]
                    if (machine && machine.cost)
                        return [machine.cost, false]
                    return [db.cost, false]
                })()
                if ((user.credits - cost[0]) >= 0 || user.free_play) {
                    if (!user.free_play && !cost[1])
                        user.credits = user.credits - cost[0]
                    db.users[db.cards[req.params.card].user] = user;
                    if (!history.dispense_log[db.cards[req.params.card].user])
                        history.dispense_log[db.cards[req.params.card].user] = [];
                    history.dispense_log[db.cards[req.params.card].user].push({
                        machine: req.params.machine_id,
                        card: req.params.card,
                        cost: cost[0],
                        free_play: user.free_play || cost[1],
                        status: true,
                        time: Date.now().valueOf()
                    })
                    if (!history.cards[req.params.card])
                        history.cards[req.params.card] = [];
                    history.cards[req.params.card].push({
                        machine: req.params.machine_id,
                        authorised: true,
                        time: Date.now().valueOf()
                    })
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(saveDatabase, 5000);
                    if (user.credits > db.low_balance) {
                        res.status(200).send(user.credits.toString());
                    } else {
                        res.status(201).send(user.credits.toString());
                    }
                    console.log(`${machine.name || req.params.machine_id} - Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : New Balance = ${user.credits} (${(cost[1] || user.free_play) ? "Freeplay" : cost[0]})`)
                } else {
                    if (!history.dispense_log[db.cards[req.params.card].user])
                        history.dispense_log[db.cards[req.params.card].user] = [];
                    history.dispense_log[db.cards[req.params.card].user].push({
                        machine: req.params.machine_id,
                        card: req.params.card,
                        cost: cost[0],
                        free_play: user.free_play || cost[1],
                        status: false,
                        time: Date.now().valueOf()
                    })
                    if (!history.cards[req.params.card])
                        history.cards[req.params.card] = [];
                    history.cards[req.params.card].push({
                        machine: req.params.machine_id,
                        authorised: true,
                        time: Date.now().valueOf()
                    })
                    res.status(400).end("DECLINED");
                    console.error(`${machine.name || req.params.machine_id} - Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : Not Enough Credits`)
                }
            } else {
                res.status(404).end();
                if (!history.cards[req.params.card])
                    history.cards[req.params.card] = [];
                history.cards[req.params.card].push({
                    machine: req.params.machine_id,
                    authorised: false,
                    time: Date.now().valueOf()
                })
                console.error(`${req.params.machine_id} - Unknown Card: ${req.params.card}`)

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
app.get('/deposit/card/:card/:credits', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.users[db.cards[req.params.card].user]) {
                let user = db.users[db.cards[req.params.card].user];
                user.credits = user.credits + parseFloat(req.params.credits);
                db.users[db.cards[req.params.card].user] = user;
                if (!history.topup_log[db.cards[req.params.card].user])
                    history.topup_log[db.cards[req.params.card].user] = [];
                history.topup_log[db.cards[req.params.card].user].push({
                    card: req.params.card,
                    cost: req.params.credits,
                    time: Date.now().valueOf()
                })
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                res.status(200).send(user.credits.toString());
                console.log(`Card TopUp: ${req.params.card} for ${db.cards[req.params.card].user} : New Balance = ${user.credits} (${req.params.credits})`)
            } else {
                res.status(404).end();
                console.error(`Unknown Card: ${req.params.card}`)
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/deposit/user/:user/:credits', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                let user = db.users[req.params.user];
                user.credits = user.credits + parseFloat(req.params.credits);
                db.users[req.params.user] = user;
                if (!history.topup_log[req.params.user])
                    history.topup_log[req.params.user] = [];
                history.topup_log[req.params.user].push({
                    card: false,
                    cost: req.params.credits,
                    time: Date.now().valueOf()
                })
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                res.status(200).send(user.credits.toString());
                console.log(`User TopUp: ${req.params.user} : New Balance = ${user.credits} (${req.params.credits})`)
            } else {
                res.status(404).end();
                console.error(`Unknown Card: ${req.params.user}`)
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/get/wallet/card/:card', (req, res) => {
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
app.get('/get/wallet/user/:user', (req, res) => {
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
app.get('/get/user/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                let user = db.users[req.params.user];
                res.status(200).json({
                    ...user,
                    cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === req.params.user),
                    history:  history.dispense_log[req.params.user],
                    topup_history:  history.topup_log[req.params.user],
                });
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
app.get('/get/card/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.users[db.cards[req.params.card].user] !== undefined) {
                let user = db.users[db.cards[req.params.card].user];
                res.status(200).json({
                    ...user,
                    cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === db.cards[req.params.card].user),
                    history:  history.dispense_log[db.cards[req.params.card].user],
                    topup_history:  history.topup_log[db.cards[req.params.card].user],
                });
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
app.get('/get/user', (req, res) => {
    if (db.cards && db.users) {
        try {
            res.status(200).json(Object.entries(db.users).map(e => {
                const user = e[1];
                const id = e[0];
                return {
                    ...user,
                    cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === id),
                    history:  history.dispense_log[id],
                    topup_history:  history.topup_log[id],
                }
            }));
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/get/card', (req, res) => {
    if (db.cards && db.users) {
        try {
            res.status(200).json(db.cards);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/get/history/cards', (req, res) => {
    if (db.cards && db.users) {
        try {
            res.status(200).json(history.cards);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});


// Register new User
app.get('/register/:user/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] === undefined) {
                const user = {
                    credits: 0,
                    name: req.query.user_name || null,
                    contact: req.query.user_contact || null,
                    locked: false,
                    free_play: false,
                }
                db.users[req.params.user] = user;
                console.log(`User Created: ${req.params.user}`, user)
            }
            if (db.users[req.params.user] !== undefined &&
                db.cards[req.params.card] === undefined) {
                let card = {
                    user: req.params.user,
                    name: req.query.card_name || null,
                    contact: req.query.card_contact || null,
                    locked: false
                }
                db.cards[req.params.card] = card;
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`New Card Created: ${req.params.card} for ${req.params.user}`, card)
                res.status(200).send(`Registered Card ${req.params.card} for ${req.params.user}`);
            } else {
                console.error(`Card Possibly Already Exists: ${req.params.card}`, db.cards[req.params.card])
                res.status(400).send("Card Already Exists!");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).end();
    }
});
// Transfer user card
app.get('/reassign/:user/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined &&
                db.cards[req.params.card] !== undefined) {
                db.cards[req.params.card].user = req.params.user;
                res.status(200).send("Moved Card!");
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
app.get('/lock/card/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                db.cards[req.params.card].locked = true;
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
app.get('/unlock/card/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                db.cards[req.params.card].locked = false;
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
// User Management
app.get('/lock/user/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].locked = true;
                res.status(200).send("User Locked");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`User Locked: ${req.params.user}`)
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
app.get('/unlock/user/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].locked = false;
                res.status(200).send("User Unlocked");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`User Unlocked: ${req.params.user}`)
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
app.get('/enable_freeplay/user/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].free_play = true;
                res.status(200).send("User is in Freeplay");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`User is in Freeplay: ${req.params.user}`)
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
app.get('/disable_freeplay/user/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].free_play = false;
                res.status(200).send("User is in credit mode");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`User is in credit mode: ${req.params.user}`)
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
app.get('/disable_freeplay/all', (req, res) => {
    if (db.cards && db.users) {
        try {
            Object.keys(db.users).map(user => {
                db.users[user].free_play = false;
            })
            res.status(200).send("Users are all in credit mode");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Users are all in credit mode`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Machine Management
app.get('/set/machine/cost/:machine_id/:cost', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].cost = parseFloat(req.params.cost)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Machine ${req.params.machine_id} now costs ${req.params.cost}`)
            res.status(200).send(`Machine ${req.params.machine_id} now costs ${req.params.cost}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/machine/name/:machine_id/:name', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].name = req.params.name
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${req.params.machine_id} is named ${req.params.name}`);
            console.log(`Machine ${req.params.machine_id} is named ${req.params.name}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/enable_freeplay/machine/:machine_id', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].free_play = true
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${req.params.machine_id} is in free_play`);
            console.log(`Machine ${req.params.machine_id} is in free_play`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/disable_freeplay/machine/:machine_id', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].free_play = false
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${req.params.machine_id} is in credit mode`);
            console.log(`Machine ${req.params.machine_id} is in credit mode`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Arcade Management
app.get('/enable_freeplay/global', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.free_play = true;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Global free_play`);
            console.log(`Global free_play`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/disable_freeplay/global', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.free_play = false;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Global credit mode`);
            console.log(`Global credit mode`)
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
