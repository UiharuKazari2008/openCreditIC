const fs = require("fs");
const express = require('express');
const app = express();
const request = require('request').defaults({ encoding: null });
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
let pendingScan = null;

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
function callVFD(machine, line1, line2) {
    request.get({
        url: machine.vfd + `/alertBoth?header=${line1}&status=${line2}`,
    }, async function (err, res, body) {
        if (err) {
            console.error(err.message);
            console.error("FAULT Getting Response Data");
        }
    })
}
app.get('/', (req, res) => {
    res.status(200).send("FastPay Server Beta");
});
// Should only be called by a cabinet
app.get(['/dispense/:machine_id/:card', '/withdraw/:machine_id/:card'], (req, res) => {
    if (db.cards && db.users) {
        try {
            const machine = db.machines[req.params.machine_id] || {}
            if (db.cards[req.params.card] !== undefined &&
                !db.cards[req.params.card].locked &&
                db.users[db.cards[req.params.card].user] !== undefined &&
                !db.users[db.cards[req.params.card].user].locked) {
                let user = db.users[db.cards[req.params.card].user];
                const cost = (() => {
                    if (machine && machine.free_play)
                        return [0, true]
                    if (db.free_play)
                        return [0, true]
                    if (machine && machine.cost)
                        return [machine.cost, false]
                    return [db.cost, false]
                })()
                const isCooldown = (() => {
                    if (history.dispense_log[db.cards[req.params.card].user] && machine.antihog_trigger && machine.antihog_min) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user];
                        if (dispense_log.length <= machine.antihog_trigger)
                            return false;
                        const cooldown_target = dispense_log[dispense_log.length - machine.antihog_trigger].time;
                        const timeDifference = Date.now().valueOf() - cooldown_target;
                        console.log(`Machine Antihog times : ${machine.antihog_trigger}x${machine.antihog_min}m - ${timeDifference / 60000}m`)
                        return timeDifference < (60000 * machine.antihog_min);
                    }
                    if (history.dispense_log[db.cards[req.params.card].user] && db.antihog_trigger && db.antihog_min) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user];
                        if (dispense_log.length <= db.antihog_trigger)
                            return false;
                        const cooldown_target = dispense_log[dispense_log.length - db.antihog_trigger].time;
                        const timeDifference = Date.now().valueOf() - cooldown_target;
                        console.log(`Global Antihog times : ${db.antihog_trigger}x${db.antihog_min}m - ${timeDifference / 60000}m`)
                        return timeDifference < (60000 * db.antihog_min);
                    }
                    if (history.dispense_log[db.cards[req.params.card].user] && db.cooldown_trigger && db.cooldown_min) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user];
                        if (dispense_log.length <= db.cooldown_trigger)
                            return false;
                        const cooldown_target = dispense_log[dispense_log.length - db.cooldown_trigger].time;
                        const timeDifference = Date.now().valueOf() - cooldown_target;
                        console.log(`Cooldown times : ${db.cooldown_trigger}x${db.cooldown_min}m - ${timeDifference / 60000}m`)
                        return timeDifference < (60000 * db.cooldown_min);
                    }
                    return false;
                })()
                if (isCooldown) {
                    /*if (!history.dispense_log[db.cards[req.params.card].user])
                        history.dispense_log[db.cards[req.params.card].user] = [];
                    history.dispense_log[db.cards[req.params.card].user].push({
                        machine: req.params.machine_id,
                        card: req.params.card,
                        cost: cost[0],
                        free_play: user.free_play || cost[1],
                        status: false,
                        time: Date.now().valueOf()
                    })*/
                    if (!history.cards[req.params.card])
                        history.cards[req.params.card] = {};
                    history.cards[req.params.card] = {
                        machine: req.params.machine_id,
                        authorised: true,
                        time: Date.now().valueOf()
                    }
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(saveDatabase, 5000);
                    if (machine && machine.vfd) {
                        //後でもう一度試してください
                        callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$8FA282C582B582A088EA8E9A8AAC82B782C682A882C982D082C5@$$! **' : '** Try again later! **', (cost[1]) ? 'Free Play' : `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                    }
                    res.status(407).json({
                        user_name: user.name,
                        cost: cost[0],
                        balance: user.credits,
                        free_play: user.free_play || cost[1],
                        status: false,
                        currency_mode: !!(db.credit_to_currency_rate),
                        currency_rate: db.credit_to_currency_rate,
                        japanese: !!((machine && machine.jpn) || db.jpn)
                    });
                    console.log(`${machine.name || req.params.machine_id} - Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : Cooldown is active`)
                } else if ((user.credits - cost[0]) >= 0 || user.free_play) {
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
                        history.cards[req.params.card] = {};
                    history.cards[req.params.card] = {
                        machine: req.params.machine_id,
                        authorised: true,
                        time: Date.now().valueOf()
                    }
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(saveDatabase, 5000);
                    if (user.credits > db.low_balance) {
                        if (machine && machine.vfd) {
                            //ゲームをしましょう
                            callVFD(machine, (((machine && machine.jpn) || db.jpn) ? '$$835188EA838082BB82B582DC82B582E582A4@$$' : 'Lets play the game!'), (cost[1]) ? 'Free Play' : `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                        }
                        res.status(200).json({
                            user_name: user.name,
                            cost: cost[0],
                            balance: user.credits,
                            free_play: user.free_play || cost[1],
                            status: true,
                            currency_mode: !!(db.credit_to_currency_rate),
                            currency_rate: db.credit_to_currency_rate,
                            japanese: !!((machine && machine.jpn) || db.jpn)
                        });
                    } else {
                        if (machine && machine.vfd) {
                            //カード残高が少ない
                            callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$834A88EA83688E638D8282AA8FAD82C882A2@$$! **' : '** Low Balance! **', (cost[1]) ? 'Free Play' : `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                        }
                        res.status(201).json({
                            user_name: user.name,
                            cost: cost[0],
                            balance: user.credits,
                            free_play: user.free_play || cost[1],
                            status: true,
                            currency_mode: !!(db.credit_to_currency_rate),
                            currency_rate: db.credit_to_currency_rate,
                            japanese: !!((machine && machine.jpn) || db.jpn)
                        });
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
                        history.cards[req.params.card] = {};
                    history.cards[req.params.card] = {
                        machine: req.params.machine_id,
                        authorised: true,
                        time: Date.now().valueOf()
                    }
                    if (machine && machine.vfd) {
                        // お金が足りない
                        callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$82A88BE082AA91AB82E882C882A2@$$! **' : '** Not enough credits! **', `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                    }
                    res.status(400).json({
                        user_name: user.name,
                        cost: cost[0],
                        balance: user.credits,
                        free_play: user.free_play || cost[1],
                        status: false,
                        currency_mode: !!(db.credit_to_currency_rate),
                        currency_rate: db.credit_to_currency_rate,
                        japanese: !!((machine && machine.jpn) || db.jpn)
                    });
                    console.error(`${machine.name || req.params.machine_id} - Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : Not Enough Credits`)
                }
            } else {
                res.status(404).end();
                if (machine && machine.vfd) {
                    // 無効なカード
                    callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$96B38CF882C8834A815B8368@$$! **' : '** Invalid Card! **', req.params.card)
                }
                if (!history.cards[req.params.card])
                    history.cards[req.params.card] = {};
                history.cards[req.params.card] ={
                    machine: req.params.machine_id,
                    authorised: false,
                    time: Date.now().valueOf()
                }
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
app.get('/deposit/scan/:credits', (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan = {
                command: "deposit_card",
                data: {
                    value: parseFloat(req.params.credits)
                }
            }
            res.status(200).send(`Waiting for card to be scanned to deposit ${req.params.credits} credits`);
            console.log(`Pending Card TopUp: Add Balance = ${req.params.credits}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
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
app.get('/callback/:machine_id/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            const machine = db.machines[req.params.machine_id] || {}
            if (pendingScan && pendingScan.command) {
                switch (pendingScan.command) {
                    case 'deposit_card':
                        if (db.cards[req.params.card] !== undefined &&
                            db.users[db.cards[req.params.card].user]) {
                            let user = db.users[db.cards[req.params.card].user];
                            user.credits = user.credits + parseFloat(pendingScan.data.value);
                            db.users[db.cards[req.params.card].user] = user;
                            if (!history.topup_log[db.cards[req.params.card].user])
                                history.topup_log[db.cards[req.params.card].user] = [];
                            history.topup_log[db.cards[req.params.card].user].push({
                                card: req.params.card,
                                cost: pendingScan.data.value,
                                time: Date.now().valueOf()
                            })
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            res.status(200).json({
                                user_name: user.name,
                                cost: 0,
                                balance: user.credits,
                                free_play: false,
                                status: true,
                                currency_mode: !!(db.credit_to_currency_rate),
                                currency_rate: db.credit_to_currency_rate,
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                            console.log(`Card TopUp: ${req.params.card} for ${db.cards[req.params.card].user} : New Balance = ${user.credits} (${pendingScan.data.value})`)
                        } else {
                            res.status(404).end();
                            console.error(`Unknown Card: ${req.params.card}`)
                        }
                        pendingScan = null;
                        break;
                    case 'register_new_card':
                        if (db.users[pendingScan.data.user] !== undefined &&
                            db.cards[req.params.card] === undefined) {
                            let card = {
                                user: pendingScan.data.user,
                                name: pendingScan.data.name || null,
                                contact: pendingScan.data.contact || null,
                                locked: false
                            }
                            db.cards[req.params.card] = card;
                            if (pendingScan.data.transferred) {
                                delete db.cards[pendingScan.data.transferred];
                            }
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            console.log(`New Card Created: ${req.params.card} for ${pendingScan.data.user}`, card)
                            res.status(210).json({
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                        } else {
                            console.error(`Card Possibly Already Exists: ${req.params.card}`, db.cards[req.params.card])
                            res.status(400).send("Card Already Exists!");
                        }
                        pendingScan = null;
                        break;
                    case 'delete_user':
                        if (db.cards[req.params.card] !== undefined) {
                            const user = db.cards[req.params.card].user;
                            Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === user).map(d => {
                                delete db.cards[d.serial];
                            })
                            delete db.users[user];
                            db.cards = db.cards.filter(c => c.user !== user);
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            console.log(`User Deleted: ${req.params.card}`)
                            res.status(440).json({
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                        } else {
                            console.error(`Card Unknown: ${req.params.card}`)
                            res.status(404).send("Unregistered Card!");
                        }
                        pendingScan = null;
                        break;
                    case 'delete_card':
                        if (db.cards[req.params.card] !== undefined) {
                            delete db.cards[req.params.card];
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            console.log(`Card Deleted: ${req.params.card}`)
                            res.status(440).json({
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                        } else {
                            console.error(`Card Unknown: ${req.params.card}`)
                            res.status(404).send("Unregistered Card!");
                        }
                        pendingScan = null;
                        break;
                    case 'freeplay_card':
                        if (db.cards[req.params.card] !== undefined &&
                            db.users[db.cards[req.params.card].user]) {
                            db.users[db.cards[req.params.card].user].free_play = true;
                            if (!history.topup_log[db.cards[req.params.card].user])
                                history.topup_log[db.cards[req.params.card].user] = [];
                            history.topup_log[db.cards[req.params.card].user].push({
                                card: req.params.card,
                                cost: pendingScan.data.value,
                                time: Date.now().valueOf()
                            })
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            res.status(200).json({
                                user_name: db.users[db.cards[req.params.card].user].name,
                                cost: 0,
                                balance: db.users[db.cards[req.params.card].user].credits,
                                free_play: true,
                                status: true,
                                currency_mode: !!(db.credit_to_currency_rate),
                                currency_rate: db.credit_to_currency_rate,
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                            console.log("User is in Freeplay: " + db.cards[req.params.card].user)
                        } else {
                            res.status(404).end();
                            console.error(`Unknown Card: ${req.params.card}`)
                        }
                        pendingScan = null;
                        break;
                    case 'transfer_card':
                        if (db.cards[req.params.card] !== undefined) {
                            const old_card = db.cards[req.params.card];
                            pendingScan = {
                                command: "register_new_card",
                                data: {
                                    user: old_card.user,
                                    name: req.query.card_name || null,
                                    contact: req.query.card_contact || null,
                                    locked: false,
                                    transferred: req.params.card,
                                }
                            }
                            console.log(`Ready for new card: ${req.params.card} `, old_card)
                            res.status(215).json({
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                        } else {
                            console.error(`Card Possibly Already Exists: ${req.params.card}`, db.cards[req.params.card])
                            res.status(400).send("Card Already Exists!");
                        }
                        break;
                    default:
                        if (db.cards[req.params.card] !== undefined &&
                            db.users[db.cards[req.params.card].user]) {
                            let user = db.users[db.cards[req.params.card].user];
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            res.status(200).json({
                                user_name: user.name,
                                cost: 0,
                                balance: user.credits,
                                free_play: user.free_play,
                                status: false,
                                currency_mode: !!(db.credit_to_currency_rate),
                                currency_rate: db.credit_to_currency_rate,
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                            console.log(`Card Scan No Action: ${req.params.card} for ${db.cards[req.params.card].user} : Balance = ${user.credits}`)
                        } else {
                            res.status(404).end();
                            console.error(`Unknown Card: ${req.params.card}`)
                        }
                        break;
                }
            } else {
                if (db.cards[req.params.card] !== undefined &&
                    db.users[db.cards[req.params.card].user]) {
                    let user = db.users[db.cards[req.params.card].user];
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(saveDatabase, 5000);
                    res.status(200).json({
                        user_name: user.name,
                        cost: 0,
                        balance: user.credits,
                        free_play: user.free_play,
                        status: false,
                        currency_mode: !!(db.credit_to_currency_rate),
                        currency_rate: db.credit_to_currency_rate,
                        japanese: !!((machine && machine.jpn) || db.jpn)
                    });
                    console.log(`Card Scan No Action: ${req.params.card} for ${db.cards[req.params.card].user} : Balance = ${user.credits}`)
                } else {
                    res.status(404).end();
                    console.error(`Unknown Card: ${req.params.card}`)
                }
                //res.status(410).send("Unknown Server Command");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
})
app.get('/blocked_callback/:machine_id/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] !== undefined &&
                db.machines[req.params.machine_id].blocked_callback !== undefined &&
                db.cards[req.params.card] !== undefined &&
                !db.cards[req.params.card].locked &&
                db.users[db.cards[req.params.card].user] !== undefined &&
                !db.users[db.cards[req.params.card].user].locked) {
                request.get({
                    url: db.machines[req.params.machine_id].blocked_callback,
                }, async function (err, res, body) {
                    if (err) {
                        console.error(err.message);
                        console.error("FAULT Getting Response Data");
                        res.status(504).send("Callback Failed");
                    } else {
                        res.status(res.statusCode).send("Callback OK");
                    }
                })
            } else {
                res.status(404).send("No Callback for this machine");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
})
app.get('/cancel_pending', (req, res) => {
    console.log("Cancelling pending");
    pendingScan = null;
    res.status(200).send("No pending scan requests");
})
// Register new User
app.get('/register/scan', (req, res) => {
    if (db.cards && db.users) {
        try {
            const userId = `user-${(Date.now()).valueOf()}`
            const user = {
                credits: (req.query.credits && !isNaN(parseFloat(req.query.credits))) ? parseFloat(req.query.credits) : 0,
                name: req.query.user_name || null,
                contact: req.query.user_contact || null,
                locked: false,
                free_play: false,
            }
            db.users[userId] = user;
            console.log(`User Created: ${userId}`, user)
            pendingScan = {
                command: "register_new_card",
                data: {
                    user: userId,
                    name: req.query.card_name || null,
                    contact: req.query.card_contact || null,
                    locked: false
                }
            }
            console.log(`New Pending Card for ${userId}`, pendingScan)
            res.status(200).send(`Waiting for card to be scanned for ${userId}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).end();
    }
});
app.get('/register/scan/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] === undefined) {
                const user = {
                    credits: (req.query.credits && !isNaN(parseFloat(req.query.credits))) ? parseFloat(req.query.credits) : 0,
                    name: req.query.user_name || null,
                    contact: req.query.user_contact || null,
                    locked: false,
                    free_play: false,
                }
                db.users[req.params.user] = user;
                console.log(`User Created: ${req.params.user}`, user)
            } else if (req.query.credits && !isNaN(parseFloat(req.query.credits))) {
                db.users[req.params.user].credits = db.users[req.params.user].credits + parseFloat(req.query.credits);
                if (!history.topup_log[req.params.user])
                    history.topup_log[req.params.user] = [];
                history.topup_log[req.params.user].push({
                    card: false,
                    cost: req.query.credits,
                    time: Date.now().valueOf()
                })
            }
            pendingScan = {
                command: "register_new_card",
                data: {
                    user: req.params.user,
                    name: req.query.card_name || null,
                    contact: req.query.card_contact || null,
                    locked: false
                }
            }
            console.log(`New Pending Card for ${req.params.user}`, pendingScan)
            res.status(200).send(`Waiting for card to be scanned for ${req.params.user}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).end();
    }
});
app.get('/register/new/:user/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] === undefined) {
                const user = {
                    credits: (req.query.credits && !isNaN(parseFloat(req.query.credits))) ? parseFloat(req.query.credits) : 0,
                    name: req.query.user_name || null,
                    contact: req.query.user_contact || null,
                    locked: false,
                    free_play: false,
                }
                db.users[req.params.user] = user;
                console.log(`User Created: ${req.params.user}`, user)
            } else if (req.query.credits && !isNaN(parseFloat(req.query.credits))) {
                db.users[req.params.user].credits = db.users[req.params.user].credits + parseFloat(req.query.credits);
                if (!history.topup_log[req.params.user])
                    history.topup_log[req.params.user] = [];
                history.topup_log[req.params.user].push({
                    card: false,
                    cost: req.query.credits,
                    time: Date.now().valueOf()
                })
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
app.get('/delete/user/:user', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === req.params.user).map(d => {
                    delete db.cards[d.serial];
                })
                delete db.users[req.params.user];
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                res.status(200).send(`User Deleted ${req.params.user}`);
            } else {
                console.error(`User does not exists: ${req.params.user}`)
                res.status(404).send("User does not exists!");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).end();
    }
});
app.get('/delete/scan/user', (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan = {
                command: "delete_user",
                data: {

                }
            }
            console.log(`New Pending Account Deletion`)
            res.status(200).send(`Waiting for card to be scanned for user delete operation`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).end();
    }
});
// Card Management
app.get('/set/card/lock/:card/:value', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                db.cards[req.params.card].locked = true;
                res.status(200).send("Card is " + ((req.params.value === "enable") ? "locked: " : "unlocked: ") + req.params.card);
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log("Card is " + ((req.params.value === "enable") ? "locked: " : "unlocked: ") + req.params.card)
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
app.get('/reassign/card/:user/:card', (req, res) => {
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
app.get('/reassign/scan', (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan = {
                command: "transfer_card",
                data: {

                }
            }
            console.log(`New Pending Card Transfer`)
            res.status(200).send(`Waiting for card to be scanned for card transfer operation`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/delete/scan/card', (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan = {
                command: "delete_card",
                data: {

                }
            }
            console.log(`New Pending Card Deletion`)
            res.status(200).send(`Waiting for card to be scanned for card delete operation`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).end();
    }
});
app.get('/delete/card/:card', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                delete db.cards[req.params.user];
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                res.status(200).send(`Card Deleted ${req.params.card}`);
            } else {
                console.error(`Card does not exists: ${req.params.card}`)
                res.status(404).send("Card does not exists!");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).end();
    }
});
// User Management
app.get('/set/user/lock/:user/:value', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].locked = (req.params.value === "enable");
                res.status(200).send("User is " + ((req.params.value === "enable") ? "locked: " : "unlocked: ") + req.params.user);
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(("User is " + (req.params.value === "enable") ? "locked: " : "unlocked: ") + req.params.user)
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
app.get('/set/user/freeplay/:user/:value', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].free_play = (req.params.value === "enable");
                res.status(200).send(((req.params.value === "enable") ? "User is in Freeplay: " : "User is in credit mode: ") + req.params.user);
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(((req.params.value === "enable") ? "User is in Freeplay: " : "User is in credit mode: ") + req.params.user)
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
app.get('/scan/freeplay', (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan = {
                command: "freeplay_card",
                data: {
                    time: null
                }
            }
            res.status(200).send(`Waiting for card to be scanned to enable freeplay`);
            console.log(`Pending Card Freeplay`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/disable_freeplay/user', (req, res) => {
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
app.get('/revoke/:user/', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user] = null;
                delete db.users[req.params.user];
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`User Revoked: ${req.params.user}`)
                res.status(200).send(`User Revoked: ${req.params.user}`);
            } else {
                console.error(`User not found: ${req.params.user}`)
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
app.get('/set/machine/antihog/:machine_id/:tap/:min', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].antihog_trigger = req.params.tap;
            db.machines[req.params.machine_id].machines = req.params.min;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${req.params.machine_id} antihog is ${req.params.tap} for ${req.params.min}min`);
            console.log(`Machine ${req.params.machine_id} antihog is ${req.params.tap} for ${req.params.min}min`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/machine/vfd/:machine_id/:ip_address/:port', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].vfd = `http://${req.params.ip_address}:${req.params.port}`
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${req.params.machine_id} now has a VFD enabled`);
            console.log(`Machine ${req.params.machine_id} now has a VFD enabled`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/machine/button/:machine_id/:api_endpoint', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].button_callback = decodeURIComponent(req.params.api_endpoint)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${req.params.machine_id} now has a button function: ${db.machines[req.params.machine_id].button_callback}`);
            console.log(`Machine ${req.params.machine_id} now has a button function: ${db.machines[req.params.machine_id].button_callback}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/machine/blocked_callback/:machine_id/:api_endpoint', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            if (req.params.api_endpoint === null) {
                delete db.machines[req.params.machine_id].blocked_callback;
                delete db.machines[req.params.machine_id].has_blocked_callback;
            } else {
                db.machines[req.params.machine_id].blocked_callback = decodeURIComponent(req.params.api_endpoint);
                db.machines[req.params.machine_id].has_blocked_callback = true;
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${req.params.machine_id} now has a blocked callback function: ${db.machines[req.params.machine_id].blocked_callback}`);
            console.log(`Machine ${req.params.machine_id} now has a blocked callback function: ${db.machines[req.params.machine_id].blocked_callback}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/machine/freeplay/:machine_id/:value', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].free_play = (req.params.value === "enable");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(((req.params.value === "enable") ? "Machine is in Freeplay: " : "Machine is in credit mode: ") + req.params.machine_id);
            console.log(((req.params.value === "enable") ? "Machine is in Freeplay: " : "Machine is in credit mode: ") + req.params.machine_id)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/machine/japanese/:machine_id/:value', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] === undefined) {
                db.machines[req.params.machine_id] = {};
            }
            db.machines[req.params.machine_id].jpn = (req.params.value === "enable");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Machine VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"));
            console.log("Machine VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"))
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/revoke/machine/:machine_id', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.machines[req.params.machine_id] = null;
            delete db.machines[req.params.machine_id];
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Machine deleted: " + req.params.machine_id);
            console.log("Machine deleted: " + req.params.machine_id);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/get/machine/:machine_id', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[req.params.machine_id] !== undefined) {
                res.status(200).json({
                    cost: db.cost,
                    free_play: db.free_play,
                    japanese: db.jpn,
                    currency_mode: !!(db.credit_to_currency_rate),
                    currency_rate: db.credit_to_currency_rate,
                    ...db.machines[req.params.machine_id]
                })
            } else {
                res.status(200).json({
                    cost: db.cost,
                    free_play: db.free_play,
                    japanese: db.jpn,
                    currency_mode: !!(db.credit_to_currency_rate),
                    currency_rate: db.credit_to_currency_rate
                })
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
// Arcade Management
app.get('/set/arcade/cost/:cost', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.cost = parseFloat(req.params.cost)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Arcade global costs is ${req.params.cost}`)
            res.status(200).send(`Arcade global costs is ${req.params.cost}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/arcade/low_balance/:balance', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.low_balance = parseFloat(req.params.balance)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Arcade low credits warning value is ${req.params.balance}`)
            res.status(200).send(`Arcade low credits warning value is ${req.params.balance}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/arcade/currency/:multiplyer', (req, res) => {
    if (db.cards && db.users) {
        try {
            if (req.params.multiplyer === "null") {
                db.credit_to_currency_rate = undefined
            } else {
                db.credit_to_currency_rate = parseFloat(req.params.multiplyer)
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Arcade currency multiplayer is 1 Credit to ${req.params.multiplyer}`)
            res.status(200).send(`Arcade currency multiplayer is 1 Credit to ${req.params.multiplyer}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/arcade/freeplay/:value', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.free_play = (req.params.value === "enable");;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Global free play is " + ((req.params.value === "enable") ? "enabled" : "disabled"));
            console.log(`Global free_play is ${(req.params.value === "enable") ? "enabled" : "disabled"}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/arcade/cooldown/:tap/:min', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.cooldown_trigger = parseInt(req.params.tap);
            db.cooldown_min = parseFloat(req.params.min);
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Global cool down is ${db.cooldown_trigger} per ${db.cooldown_min}min`);
            console.log(`Global cool down is ${db.cooldown_trigger} per ${db.cooldown_min}min`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/arcade/antihog/:tap/:min', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.antihog_trigger = parseInt(req.params.tap);
            db.antihog_min = parseFloat(req.params.min);
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Global antihog is ${db.cooldown_trigger} credits per ${db.cooldown_min}min`);
            console.log(`Global antihog is ${db.cooldown_trigger} credits per ${db.cooldown_min}min`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});
app.get('/set/arcade/japanese/:value', (req, res) => {
    if (db.cards && db.users) {
        try {
            db.jpn = (req.params.value === "enable");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Global VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"));
            console.log("Global VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"))
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).end();
        }
    } else {
        res.status(500).end();
    }
});

app.listen(port, () => {
    console.log(`Card server is running on http://0.0.0.0:${port}`);
});
