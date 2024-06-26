const fs = require("fs");
const config = require('./config.json');
const express = require('express');
const moment = require('moment');
const app = express();
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));
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
        cards: {},
        machines_dispense: {},
        machines_checkin: {},
    }), null, 2);
}
let history = require('./history.json');
let pendingTimeout;
let pendingScan = {

};
let pendingResponse = {

};

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
function callVFDCenter(machine, line1) {
    request.get({
        url: machine.vfd + `/alertCenter?header=${line1}`,
    }, async function (err, res, body) {
        if (err) {
            console.error(err.message);
            console.error("FAULT Getting Response Data");
        }
    })
}

function readerAuth(req, res, next) {
    if (config.device_key) {
        if (req.query.key && req.query.key === config.device_key) {
            next();
        } else {
            res.status(401).send("Invalid Auth Provided")
        }
    } else {
        next();
    }
}
function manageAuth(req, res, next) {
    if (config.web_key) {
        if (req.query.key && req.query.key === config.web_key) {
            next();
        } else {
            res.status(401).send("Invalid Auth Provided")
        }
    } else {
        next();
    }
}
function countItemsWithSameUser(arr) {
    let count = 1; // Initialize count to 1 for the last item
    const lastId = arr[arr.length - 1].user; // Get the id of the last item

    // Iterate in reverse order starting from the second-to-last item
    for (let i = arr.length - 2; i >= 0; i--) {
        if (arr[i].user === lastId) {
            count++;
        } else {
            break; // Stop counting when a different id is found
        }
    }

    return count;
}
function countItemsWithSameUserSession(arr) {
    let count = 1; // Initialize count to 1 for the last item
    const lastId = arr[arr.length - 1].user; // Get the id of the last item

    // Iterate in reverse order starting from the second-to-last item
    for (let i = arr.length - 2; i >= 0; i--) {
        if (arr[i].user === lastId && (!arr[i + 1].time || (arr[i - 1].time && (arr[i + 1].time - arr[i].time <= (60 * 60000))))) {
            count++;
        } else {
            break; // Stop counting when a different id is found
        }
    }

    return count;
}
function countUserSessionTotal(arr) {
    let count = arr[arr.length - 1].cost; // Initialize count to 1 for the last item
    const lastId = arr[arr.length - 1].user; // Get the id of the last item

    // Iterate in reverse order starting from the second-to-last item
    for (let i = arr.length - 2; i >= 0; i--) {
        if (arr[i].user === lastId && (!arr[i + 1].time || (arr[i - 1].time && (arr[i + 1].time - arr[i].time <= (60 * 60000))))) {
            count = count + arr[i].cost;
        } else {
            break; // Stop counting when a different id is found
        }
    }

    return count;
}
function getTotalSessiontime(count, arr) {
    return arr[arr.length - 1].time - arr[arr.length - count].time
}
function msToTime(s,f) {
    // Pad to 2 or 3 digits, default is 2
    function pad(n, z) {
        z = z || 2;
        return ('00' + n).slice(-z);
    }

    var ms = s % 1000;
    s = (s - ms) / 1000;
    var secs = s % 60;
    s = (s - secs) / 60;
    var mins = s % 60;
    var hrs = (s - mins) / 60;

    return ((hrs > 0 || f) ? pad(hrs) + ':' : '') + pad(mins) + ':' + pad(secs) + ((f) ? '.' + pad(ms, 2) : '')
}

//polyfill shit
if (!history.machines_dispense) {
    if (!history.machines_dispense)
        history.machines_dispense = {};
    Object.entries(history.dispense_log).map(u => {
        u[1].map(m => {
            if (!history.machines_dispense[m.machine])
                history.machines_dispense[m.machine] = [];
            history.machines_dispense[m.machine].push({
                user: u[0],
                ...m
            })
        })
    })
    for (const key in history.machines_dispense) {
        if (history.machines_dispense.hasOwnProperty(key)) {
            history.machines_dispense[key] = history.machines_dispense[key].sort((a, b) => a.time - b.time);
        }
    }
    console.log('Migrated Dispense Logs');
    saveDatabase();
}
if (!history.machines_checkin) {
    history.machines_checkin = {}
}

app.set('view engine', 'pug');
app.set('views', './web/views');
app.get('/', manageAuth, (req, res) => {
    const homepage_date = {
        pendingScan,
        db,
        pos_terminals: Object.entries(db.machines).filter(e => e[1].pos_mode === true),
        config,
        machine_dispense: Object.entries(history.machines_dispense).map(e => {
            const date = moment(new Date(e[1][e[1].length - 1].time))
            const pretty_date = date.format("DD/MM HH:mm:ss")
            const today = e[1].filter(e => e.time >= (Date.now().valueOf() - 24 * 60 * 60000))
            let today_made = 0;
            today.filter(e => !e.free_play).map(e => {
                today_made = today_made + e.cost
            })
            return {
                id: e[0],
                info: db.machines[e[0]],
                today: {
                    users: [...new Set(today.map(e => e.user))],
                    profit: today_made,
                },
                last: {
                    ...e[1][e[1].length - 1],
                    user_info: db.users[e[1][e[1].length - 1].user],
                    user_b2b: countItemsWithSameUserSession(e[1]),
                    user_total_profit: countUserSessionTotal(e[1]),
                    user_total_time: msToTime(getTotalSessiontime(countItemsWithSameUserSession(e[1]), e[1])),
                    time_pretty: pretty_date
                }
            }
        })
    }
    if (req.header("Seq-BaseURL")) {
        res.status(200).render('home-seqapp', {
            baseUrl: req.header("Seq-BaseURL"),
            ...homepage_date
        });
    } else {
        res.status(200).render('home', homepage_date);
    }
});
app.use('/static', express.static('./web/static', ));
app.use('/ui_static', express.static('./ui_images', ));
// Should only be called by a cabinet
app.get(['/get/machine/:machine_id/:mode', '/get/machine/:machine_id'], readerAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (!history.machines_checkin[(req.params.machine_id).toUpperCase()])
                history.machines_checkin[(req.params.machine_id).toUpperCase()] = {};
            switch (req.params.mode){
                case "init":
                case "checkin":
                    history.machines_checkin[(req.params.machine_id).toUpperCase()][req.params.mode] = Date.now().valueOf();
                    break;
                default:
                    history.machines_checkin[(req.params.machine_id).toUpperCase()]["init"] = Date.now().valueOf();
                    break;
            }
            if (db.machines[(req.params.machine_id).toUpperCase()] !== undefined) {
                res.status(200).json({
                    cost: db.cost,
                    free_play: db.free_play,
                    japanese: db.jpn,
                    currency_mode: !!(db.credit_to_currency_rate),
                    currency_rate: db.credit_to_currency_rate,
                    ...db.machines[(req.params.machine_id).toUpperCase()]
                })
            } else {
                res.status(404).json({
                    cost: db.cost,
                    free_play: db.free_play,
                    japanese: db.jpn,
                    currency_mode: !!(db.credit_to_currency_rate),
                    currency_rate: db.credit_to_currency_rate
                })
                console.error("Unknown Card Reader Login - " + (req.params.machine_id).toUpperCase())
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get(['/dispense/:machine_id/:card', '/withdraw/:machine_id/:card'], readerAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            const machine = db.machines[(req.params.machine_id).toUpperCase()] || {}
            if (db.cards[req.params.card] !== undefined &&
                !db.cards[req.params.card].locked &&
                db.users[db.cards[req.params.card].user] !== undefined &&
                !db.users[db.cards[req.params.card].user].locked) {
                let user = db.users[db.cards[req.params.card].user];
                const discount = (() => {
                    if (history.dispense_log[db.cards[req.params.card].user] && machine.discount_tap && machine.discount_cost && machine.discount_sec) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user].filter(e => e.status);
                        if (dispense_log.length <= machine.discount_tap)
                            return false;
                        const discount_target = dispense_log[dispense_log.length - machine.discount_tap].time;
                        const was_discount = dispense_log[dispense_log.length - machine.discount_tap].discount;
                        const timeDifference = Date.now().valueOf() - discount_target;
                        return (timeDifference < (1000 * machine.discount_sec)) ? machine.discount_cost : false;
                    }
                    if (history.dispense_log[db.cards[req.params.card].user] && db.discount_tap && db.discount_cost && db.discount_sec) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user].filter(e => e.status);
                        if (dispense_log.length <= db.discount_tap)
                            return false;
                        const discount_target = dispense_log[dispense_log.length - db.discount_tap].time;
                        const was_discount = dispense_log[dispense_log.length - db.discount_tap].discount;
                        const timeDifference = Date.now().valueOf() - discount_target;
                        return (timeDifference < (1000 * db.discount_sec)) ? db.discount_cost : false;
                    }
                    return false;
                })()
                // Clear Expired Freeplay Values
                if (machine.free_play && machine.free_play_time_limit && !(Date.now().valueOf() <= machine.free_play_time_limit)) {
                    machine.free_play = false
                    delete machine.free_play_time_limit
                }
                if (db.free_play && db.free_play_time_limit && !(Date.now().valueOf() <= db.free_play_time_limit)) {
                    db.free_play = false
                    delete db.free_play_time_limit
                }
                if (user.free_play && user.free_play_time_limit && !(Date.now().valueOf() <= user.free_play_time_limit)) {
                    user.free_play = false
                    delete user.free_play_time_limit
                }
                const cost = (() => {
                    if (machine && machine.free_play && (!machine.free_play_time_limit || (machine.free_play_time_limit && Date.now().valueOf() <= machine.free_play_time_limit)))
                        return {val: 0, free_play: true, time_left: (machine.free_play_time_limit) ? machine.free_play_time_limit - Date.now().valueOf() : -1}
                    if (db.free_play && (!db.free_play_time_limit || (db.free_play_time_limit && Date.now().valueOf() <= db.free_play_time_limit)))
                        return {val: 0, free_play: true, time_left: (db.free_play_time_limit) ? db.free_play_time_limit - Date.now().valueOf() : -1}
                    if (user.free_play && (!user.free_play_time_limit || (user.free_play_time_limit && Date.now().valueOf() <= user.free_play_time_limit)))
                        return {val: 0, free_play: true, time_left: (user.free_play_time_limit) ? user.free_play_time_limit - Date.now().valueOf() : -1}
                    if (discount)
                        return {val: discount, free_play: false, time_left: 0}
                    if (machine && machine.cost)
                        return {val: machine.cost, free_play: false, time_left: 0}
                    return {val: db.cost, free_play: false, time_left: 0}
                })()
                const isCooldown = (() => {
                    if (history.dispense_log[db.cards[req.params.card].user] && machine.antihog_trigger && machine.antihog_min) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user].filter(e => e.status && e.machine === (req.params.machine_id).toUpperCase());
                        if (dispense_log.length <= machine.antihog_trigger)
                            return 0;
                        const cooldown_target = dispense_log[(dispense_log.length - 1) - machine.antihog_trigger].time;
                        const timeDifference = Date.now().valueOf() - cooldown_target;
                        console.log(`Machine Antihog times : ${machine.antihog_trigger}x${machine.antihog_min}m - ${timeDifference / 60000}m`)
                        return (timeDifference < (60000 * machine.antihog_min)) ? 3 : 0
                    }
                    if (history.dispense_log[db.cards[req.params.card].user] && db.antihog_trigger && db.antihog_min) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user].filter(e => e.status && e.machine === (req.params.machine_id).toUpperCase());
                        if (dispense_log.length <= db.antihog_trigger)
                            return 0;
                        const cooldown_target = dispense_log[(dispense_log.length - 1) - db.antihog_trigger].time;
                        const timeDifference = Date.now().valueOf() - cooldown_target;
                        console.log(`Global Antihog times : ${db.antihog_trigger}x${db.antihog_min}m - ${timeDifference / 60000}m`)
                        return (timeDifference < (60000 * db.antihog_min)) ? 2 : 0
                    }
                    if (history.dispense_log[db.cards[req.params.card].user] && machine.cooldown_trigger && machine.cooldown_min) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user].filter(e => e.status);
                        if (dispense_log.length <= machine.cooldown_trigger)
                            return 0;
                        const cooldown_target = dispense_log[(dispense_log.length - 1) - machine.cooldown_trigger].time;
                        const timeDifference = Date.now().valueOf() - cooldown_target;
                        console.log(`Machine Cooldown times : ${machine.cooldown_trigger}x${machine.cooldown_min}m - ${timeDifference / 60000}m`)
                        return (timeDifference < (60000 * machine.cooldown_min)) ? 1 : 0
                    }
                    if (history.dispense_log[db.cards[req.params.card].user] && db.cooldown_trigger && db.cooldown_min) {
                        const dispense_log = history.dispense_log[db.cards[req.params.card].user].filter(e => e.status);
                        if (dispense_log.length <= db.cooldown_trigger)
                            return 0;
                        const cooldown_target = dispense_log[(dispense_log.length - 1) - db.cooldown_trigger].time;
                        const timeDifference = Date.now().valueOf() - cooldown_target;
                        console.log(`Global Cooldown times : ${db.cooldown_trigger}x${db.cooldown_min}m - ${timeDifference / 60000}m`)
                        return (timeDifference < (60000 * db.cooldown_min)) ? 1 : 0
                    }
                    return 0;
                })()
                if (isCooldown) {
                    if (!history.dispense_log[db.cards[req.params.card].user])
                        history.dispense_log[db.cards[req.params.card].user] = [];
                    history.dispense_log[db.cards[req.params.card].user].push({
                        machine: (req.params.machine_id).toUpperCase(),
                        card: req.params.card,
                        cost: cost.val,
                        free_play: cost.free_play,
                        time_left: cost.time_left,
                        status: false,
                        cool_down: isCooldown,
                        time: Date.now().valueOf()
                    })
                    if (!history.cards[req.params.card])
                        history.cards[req.params.card] = {};
                    history.cards[req.params.card] = {
                        machine: (req.params.machine_id).toUpperCase(),
                        authorised: true,
                        time: Date.now().valueOf()
                    }
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(saveDatabase, 5000);
                    if (machine && machine.vfd) {
                        //後でもう一度試してください
                        callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$8FA282C582B582A088EA8E9A8AAC82B782C682A882C982D082C5@$$! **' : '** Try again later! **', (cost.free_play) ? 'Free Play' : `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                    }
                    res.status(407).json({
                        user_name: user.name,
                        cost: cost.val,
                        balance: user.credits,
                        free_play: cost.free_play,
                        time_left: cost.time_left,
                        status: false,
                        discount: !!(discount),
                        cool_down: isCooldown,
                        currency_mode: !!(db.credit_to_currency_rate),
                        currency_rate: db.credit_to_currency_rate,
                        japanese: !!((machine && machine.jpn) || db.jpn)
                    });
                    console.log(`${machine.name || (req.params.machine_id).toUpperCase()} - Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : Cooldown is active`)
                } else if (cost.free_play || ((user.credits - cost.val) >= 0)) {
                    if (!cost.free_play)
                        user.credits = user.credits - cost.val
                    db.users[db.cards[req.params.card].user] = user;
                    if (!history.dispense_log[db.cards[req.params.card].user])
                        history.dispense_log[db.cards[req.params.card].user] = [];
                    history.dispense_log[db.cards[req.params.card].user].push({
                        machine: (req.params.machine_id).toUpperCase(),
                        card: req.params.card,
                        cost: cost.val,
                        discount: !!(discount),
                        free_play: cost.free_play,
                        time_left: cost.time_left,
                        cool_down: isCooldown,
                        status: true,
                        time: Date.now().valueOf()
                    })
                    if (!history.cards[req.params.card])
                        history.cards[req.params.card] = {};
                    history.cards[req.params.card] = {
                        machine: (req.params.machine_id).toUpperCase(),
                        authorised: true,
                        time: Date.now().valueOf()
                    }
                    if (!history.machines_dispense[(req.params.machine_id).toUpperCase()])
                        history.machines_dispense[(req.params.machine_id).toUpperCase()] = [];
                    history.machines_dispense[(req.params.machine_id).toUpperCase()].push({
                        user: db.cards[req.params.card].user,
                        card: req.params.card,
                        cost: cost.val,
                        discount: !!(discount),
                        free_play: cost.free_play,
                        time_left: cost.time_left,
                        status: true,
                        time: Date.now().valueOf()
                    })
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(saveDatabase, 5000);
                    if (user.credits > db.low_balance) {
                        if (machine && machine.vfd) {
                            //ゲームをしましょう
                            callVFD(machine, (((machine && machine.jpn) || db.jpn) ? '$$835188EA838082BB82B582DC82B582E582A4@$$' : 'Lets play the game!'), (cost.free_play) ? 'Free Play' : `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                        }
                        res.status(200).json({
                            user_name: user.name,
                            cost: cost.val,
                            balance: user.credits,
                            free_play: cost.free_play,
                            time_left: cost.time_left,
                            status: true,
                            discount: !!(discount),
                            cool_down: isCooldown,
                            currency_mode: !!(db.credit_to_currency_rate),
                            currency_rate: db.credit_to_currency_rate,
                            japanese: !!((machine && machine.japanese) || db.jpn)
                        });
                    } else {
                        if (machine && machine.vfd) {
                            //カード残高が少ない
                            callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$834A88EA83688E638D8282AA8FAD82C882A2@$$! **' : '** Low Balance! **', (cost.free_play) ? 'Free Play' : `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                        }
                        res.status(201).json({
                            user_name: user.name,
                            cost: cost.val,
                            balance: user.credits,
                            free_play: cost.free_play,
                            time_left: cost.time_left,
                            status: true,
                            discount: !!(discount),
                            cool_down: isCooldown,
                            currency_mode: !!(db.credit_to_currency_rate),
                            currency_rate: db.credit_to_currency_rate,
                            japanese: !!((machine && machine.japanese) || db.jpn)
                        });
                    }
                    if (machine && machine.withdraw_callback) {
                        try {
                            request.get({
                                url: machine.withdraw_callback,
                            }, async function (err, res, body) {
                                if (err) {
                                    console.error(err.message);
                                    console.error("FAULT Sending Withdraw Call");
                                }
                            })
                        } catch (err) {
                            console.error(err.message);
                            console.error("FAULT Sending Withdraw Call");
                        }
                    }
                    console.log(`${machine.name || (req.params.machine_id).toUpperCase()} - Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : New Balance = ${user.credits} (${(cost.free_play) ? "Freeplay" : cost.val})`)
                } else {
                    if (!history.dispense_log[db.cards[req.params.card].user])
                        history.dispense_log[db.cards[req.params.card].user] = [];
                    history.dispense_log[db.cards[req.params.card].user].push({
                        machine: (req.params.machine_id).toUpperCase(),
                        card: req.params.card,
                        cost: cost.val,
                        discount: !!(discount),
                        free_play: cost.free_play,
                        time_left: cost.time_left,
                        status: false,
                        cool_down: isCooldown,
                        time: Date.now().valueOf()
                    })
                    if (!history.cards[req.params.card])
                        history.cards[req.params.card] = {};
                    history.cards[req.params.card] = {
                        machine: (req.params.machine_id).toUpperCase(),
                        authorised: true,
                        time: Date.now().valueOf()
                    }
                    if (machine && machine.vfd) {
                        // お金が足りない
                        callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$82A88BE082AA91AB82E882C882A2@$$! **' : '** Not enough credits! **', `${(db.jpn) ? '$$8DE0957A@$$' : 'Wallet'} ${(db.credit_to_currency_rate) ? ((db.jpn) ? '$$818F@$$' : '$') : ''}${(db.credit_to_currency_rate) ? (user.credits * db.credit_to_currency_rate) : user.credits}`)
                    }
                    res.status(400).json({
                        user_name: user.name,
                        cost: cost.val,
                        balance: user.credits,
                        free_play: cost.free_play,
                        time_left: cost.time_left,
                        status: false,
                        discount: !!(discount),
                        cool_down: isCooldown,
                        currency_mode: !!(db.credit_to_currency_rate),
                        currency_rate: db.credit_to_currency_rate,
                        japanese: !!((machine && machine.japanese) || db.jpn)
                    });
                    console.error(`${machine.name || (req.params.machine_id).toUpperCase()} - Card Scan: ${req.params.card} for ${db.cards[req.params.card].user} : Not Enough Credits`)
                }
            } else {
                res.status(404).send('Unknown Card');
                if (machine && machine.vfd) {
                    // 無効なカード
                    callVFD(machine, ((machine && machine.jpn) || db.jpn) ? '** $$96B38CF882C8834A815B8368@$$! **' : '** Invalid Card! **', req.params.card)
                }
                if (!history.cards[req.params.card])
                    history.cards[req.params.card] = {};
                history.cards[req.params.card] = {
                    machine: (req.params.machine_id).toUpperCase(),
                    authorised: false,
                    time: Date.now().valueOf()
                }
                console.error(`${(req.params.machine_id).toUpperCase()} - Unknown Card: ${req.params.card}`)

            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/callback/:machine_id/:card', readerAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            const machine = db.machines[(req.params.machine_id).toUpperCase()] || {}
            if (pendingScan[(req.params.machine_id).toUpperCase()] && pendingScan[(req.params.machine_id).toUpperCase()].command) {
                switch (pendingScan[(req.params.machine_id).toUpperCase()].command) {
                    case 'deposit_card':
                        if (db.cards[req.params.card] !== undefined &&
                            db.users[db.cards[req.params.card].user]) {
                            let user = db.users[db.cards[req.params.card].user];
                            user.credits = user.credits + parseFloat(pendingScan[(req.params.machine_id).toUpperCase()].data.value);
                            db.users[db.cards[req.params.card].user] = user;
                            if (!history.topup_log[db.cards[req.params.card].user])
                                history.topup_log[db.cards[req.params.card].user] = [];
                            history.topup_log[db.cards[req.params.card].user].push({
                                card: req.params.card,
                                cost: pendingScan[(req.params.machine_id).toUpperCase()].data.value,
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
                            console.log(`Card TopUp: ${req.params.card} for ${db.cards[req.params.card].user} : New Balance = ${user.credits} (${pendingScan[(req.params.machine_id).toUpperCase()].data.value})`)
                        } else {
                            res.status(404).send('Unknown Card');
                            console.error(`Unknown Card: ${req.params.card}`)
                        }
                        pendingScan[(req.params.machine_id).toUpperCase()] = null;
                        break;
                    case 'register_new_card':
                        if (db.users[pendingScan[(req.params.machine_id).toUpperCase()].data.user] !== undefined &&
                            db.cards[req.params.card] === undefined) {
                            let card = {
                                user: pendingScan[(req.params.machine_id).toUpperCase()].data.user,
                                name: pendingScan[(req.params.machine_id).toUpperCase()].data.name || null,
                                contact: pendingScan[(req.params.machine_id).toUpperCase()].data.contact || null,
                                locked: false
                            }
                            db.cards[req.params.card] = card;
                            if (pendingScan[(req.params.machine_id).toUpperCase()].data.transferred) {
                                delete db.cards[pendingScan[(req.params.machine_id).toUpperCase()].data.transferred];
                            }
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            console.log(`New Card Created: ${req.params.card} for ${pendingScan[(req.params.machine_id).toUpperCase()].data.user}`, card)
                            res.status(210).json({
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                        } else {
                            console.error(`Card Possibly Already Exists: ${req.params.card}`, db.cards[req.params.card])
                            res.status(400).send("Card Already Exists!");
                        }
                        pendingScan[(req.params.machine_id).toUpperCase()] = null;
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
                        pendingScan[(req.params.machine_id).toUpperCase()] = null;
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
                        pendingScan[(req.params.machine_id).toUpperCase()] = null;
                        break;
                    case 'freeplay_card':
                        if (db.cards[req.params.card] !== undefined &&
                            db.users[db.cards[req.params.card].user]) {
                            db.users[db.cards[req.params.card].user].free_play = true;
                            if (pendingScan[(req.params.machine_id).toUpperCase()].data.time) {
                                const time_in_hours = pendingScan[(req.params.machine_id).toUpperCase()].data.time;
                                db.users[db.cards[req.params.card].user].free_play_time_limit = (Date.now().valueOf() + (time_in_hours * 3600000))
                            }
                            if (!history.topup_log[db.cards[req.params.card].user])
                                history.topup_log[db.cards[req.params.card].user] = [];
                            history.topup_log[db.cards[req.params.card].user].push({
                                card: req.params.card,
                                cost: pendingScan[(req.params.machine_id).toUpperCase()].data.value,
                                time: Date.now().valueOf()
                            })
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(saveDatabase, 5000);
                            res.status(200).json({
                                user_name: db.users[db.cards[req.params.card].user].name,
                                cost: 0,
                                balance: db.users[db.cards[req.params.card].user].credits,
                                free_play: true,
                                time_left: db.users[db.cards[req.params.card].user].free_play_time_limit - Date.now().valueOf(),
                                status: true,
                                currency_mode: !!(db.credit_to_currency_rate),
                                currency_rate: db.credit_to_currency_rate,
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                            console.log("User is in Freeplay: " + db.cards[req.params.card].user)
                        } else {
                            res.status(404).send("Unknown Card");
                            console.error(`Unknown Card: ${req.params.card}`)
                        }
                        pendingScan[(req.params.machine_id).toUpperCase()] = null;
                        break;
                    case 'transfer_card':
                        if (db.cards[req.params.card] !== undefined) {
                            const old_card = db.cards[req.params.card];
                            pendingScan[(req.params.machine_id).toUpperCase()] = {
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
                    case 'info_card':
                        if (db.cards[req.params.card] !== undefined) {
                            pendingResponse[(req.params.machine_id).toUpperCase()] = {
                                status: true,
                                id: db.cards[req.params.card].user,
                                ...db.users[db.cards[req.params.card].user],
                                cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === db.cards[req.params.card].user),
                                history:  history.dispense_log[db.cards[req.params.card].user],
                                topup_history:  history.topup_log[db.cards[req.params.card].user],
                            };
                            res.status(200).json({
                                user_name: db.users[db.cards[req.params.card].user].name,
                                cost: 0,
                                balance: db.users[db.cards[req.params.card].user].credits,
                                free_play: db.users[db.cards[req.params.card].user].free_play,
                                time_left: db.users[db.cards[req.params.card].user].free_play_time_limit - Date.now().valueOf(),
                                status: false,
                                currency_mode: !!(db.credit_to_currency_rate),
                                currency_rate: db.credit_to_currency_rate,
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                        } else {
                            pendingResponse[(req.params.machine_id).toUpperCase()] = {
                                status: false
                            }
                            res.status(404).send("Unknown Card");
                        }
                        pendingScan[(req.params.machine_id).toUpperCase()] = null;
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
                                time_left: db.users[db.cards[req.params.card].user].free_play_time_limit - Date.now().valueOf(),
                                status: false,
                                currency_mode: !!(db.credit_to_currency_rate),
                                currency_rate: db.credit_to_currency_rate,
                                japanese: !!((machine && machine.jpn) || db.jpn)
                            });
                            console.log(`Card Scan No Action: ${req.params.card} for ${db.cards[req.params.card].user} : Balance = ${user.credits}`)
                        } else {
                            res.status(404).send("Unknown Card");
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
                        time_left: db.users[db.cards[req.params.card].user].free_play_time_limit - Date.now().valueOf(),
                        status: false,
                        currency_mode: !!(db.credit_to_currency_rate),
                        currency_rate: db.credit_to_currency_rate,
                        japanese: !!((machine && machine.jpn) || db.jpn)
                    });
                    console.log(`Card Scan No Action: ${req.params.card} for ${db.cards[req.params.card].user} : Balance = ${user.credits}`)
                } else {
                    res.status(404).send("Unknown Card");
                    console.error(`Unknown Card: ${req.params.card}`)
                }
                //res.status(410).send("Unknown Server Command");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
})
app.get('/blocked_callback/:machine_id/:card', readerAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] !== undefined &&
                db.machines[(req.params.machine_id).toUpperCase()].blocked_callback !== undefined &&
                db.cards[req.params.card] !== undefined &&
                !db.cards[req.params.card].locked &&
                db.users[db.cards[req.params.card].user] !== undefined &&
                !db.users[db.cards[req.params.card].user].locked) {
                res.status(200).send("Callback OK");
                if (db.machines[(req.params.machine_id).toUpperCase()] && db.machines[(req.params.machine_id).toUpperCase()].vfd) {
                    //ちょっと 待って
                    callVFDCenter(db.machines[(req.params.machine_id).toUpperCase()], ((db.machines[(req.params.machine_id).toUpperCase()] && db.machines[(req.params.machine_id).toUpperCase()].jpn) || db.jpn) ? '$$82A882E882C682A2208DC58EFC@$$...' : 'Please Wait...')
                }
                if (!req.query.request_only) {
                    request.get({
                        url: db.machines[(req.params.machine_id).toUpperCase()].blocked_callback,
                    }, async function (err, res, body) {
                        if (err) {
                            console.error(err.message);
                            console.error("FAULT Getting Response Data");
                        }
                    })
                }
            } else {
                res.status(404).send("No Callback for this machine");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
})
// Called by POS
app.get('/deposit/scan/:machine_id/:credits', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (!isNaN(parseFloat(req.params.credits))) {
                pendingScan[(req.params.machine_id).toUpperCase()] = {
                    command: "deposit_card",
                    data: {
                        value: parseFloat(req.params.credits)
                    }
                }
                clearTimeout(pendingTimeout);
                pendingTimeout = setTimeout(() => {
                    delete pendingScan[(req.params.machine_id).toUpperCase()];
                }, 30000)
                res.status(200).send(`Waiting for card to be scanned to deposit ${req.params.credits} credits`);
                console.log(`Pending Card TopUp: Add Balance = ${req.params.credits}`);
            } else {
                res.status(400).send(`Invalid credit amount`);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send("Server Error");
    }
});
app.get('/deposit/card/:card/:credits', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.users[db.cards[req.params.card].user] && !isNaN(parseFloat(req.params.credits))) {
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
                res.status(404).send('Unknown Card');
                console.error(`Unknown Card: ${req.params.card}`)
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Server Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/deposit/user/:user/:credits', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined && !isNaN(parseFloat(req.params.credits))) {
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
                res.status(404).send('Unknown User');
                console.error(`Unknown User: ${req.params.user}`)
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/wallet/card/:card', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.cards[req.params.card].locked === false &&
                db.users[db.cards[req.params.card].user]) {
                let user = db.users[db.cards[req.params.card].user];
                res.status(200).send(user.credits.toString());
            } else {
                res.status(404).send('Unknown Card');
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/wallet/user/:user', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                let user = db.users[req.params.user];
                res.status(200).send(user.credits.toString());
            } else {
                res.status(404).send("Unknown User");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/user/:user', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                let user = db.users[req.params.user];
                res.status(200).json({
                    id: req.params.user,
                    ...user,
                    cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === req.params.user),
                    history:  history.dispense_log[req.params.user],
                    topup_history:  history.topup_log[req.params.user],
                });
            } else {
                res.status(404).send("Unknown User");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/rendered/user/:user', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                let user = db.users[req.params.user];
                res.status(200).render('user-data', {
                    id: req.params.user,
                    ...user,
                    cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === req.params.user),
                    history:  history.dispense_log[req.params.user],
                    topup_history:  history.topup_log[req.params.user],
                    show_delete_actions: config.show_delete_actions
                });
            } else {
                res.status(404).send("Unknown User");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/scan/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan[(req.params.machine_id).toUpperCase()] = {
                command: "info_card",
                data: {
                }
            }
            clearTimeout(pendingTimeout);
            pendingTimeout = setTimeout(() => { delete pendingScan[(req.params.machine_id).toUpperCase()]; }, 30000)
            console.log(`New Pending Card for card data`, pendingScan[(req.params.machine_id).toUpperCase()])
            res.status(200).send(`Waiting for card to be scanned for data`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/card/:card', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.users[db.cards[req.params.card].user] !== undefined) {
                let user = db.users[db.cards[req.params.card].user];
                res.status(200).json({
                    id: db.cards[req.params.card].user,
                    ...user,
                    cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === db.cards[req.params.card].user),
                    history:  history.dispense_log[db.cards[req.params.card].user],
                    topup_history:  history.topup_log[db.cards[req.params.card].user],
                });
            } else {
                res.status(404).send("Unknown Card");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/rendered/card/:card', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined &&
                db.users[db.cards[req.params.card].user] !== undefined) {
                let user = db.users[db.cards[req.params.card].user];
                res.status(200).render('user-data', {
                    id: db.cards[req.params.card].user,
                    ...user,
                    cards: Object.entries(db.cards).map(e => { return { serial: e[0], ...e[1] }}).filter(e => e.user === db.cards[req.params.card].user),
                    history:  history.dispense_log[db.cards[req.params.card].user],
                    topup_history:  history.topup_log[db.cards[req.params.card].user],
                    show_delete_actions: config.show_delete_actions
                });
            } else {
                res.status(404).send("Unknown Card");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/user', manageAuth, (req, res) => {
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
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/card', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            res.status(200).json(db.cards);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/history/cards', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            res.status(200).json(history.cards);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/cancel_pending/:machine_id', manageAuth, (req, res) => {
    console.log("Cancelling pending");
    pendingScan[(req.params.machine_id).toUpperCase()] = null;
    clearTimeout(pendingTimeout);
    res.status(200).send("No pending scan requests");
})
app.get('/get_pending/:machine_id', manageAuth, (req, res) => {
    if (pendingScan[(req.params.machine_id).toUpperCase()] && pendingScan[(req.params.machine_id).toUpperCase()].command) {
        res.status(200).json(pendingScan[(req.params.machine_id).toUpperCase()]);
    } else {
        res.status(404).send("No pending scan requests");
    }
})
app.get('/wait_pending/:machine_id', async (req, res) => {
    if (pendingScan[(req.params.machine_id).toUpperCase()] && pendingScan[(req.params.machine_id).toUpperCase()].command) {
        while (pendingScan[(req.params.machine_id).toUpperCase()] && pendingScan[(req.params.machine_id).toUpperCase()].command) {
            await sleep(1000).then(() => {
                console.log(`Waiting for card scan...`)
                if (!(pendingScan[(req.params.machine_id).toUpperCase()] && pendingScan[(req.params.machine_id).toUpperCase()].command)) {
                    res.status(200).send('Request Completed');
                }
            })
        }
    } else {
        res.status(404).send("No pending scan requests");
    }
})
app.get('/wait_data/:machine_id', async (req, res) => {
    if (pendingScan[(req.params.machine_id).toUpperCase()] && pendingScan[(req.params.machine_id).toUpperCase()].command) {
        let i = 0;
        while (i <= 31) {
            await sleep(1000).then(() => {
                console.log(`Waiting for response...`)
                if (pendingResponse[(req.params.machine_id).toUpperCase()]) {
                    if (pendingResponse[(req.params.machine_id).toUpperCase()].status) {
                        res.status(200).json(pendingResponse[(req.params.machine_id).toUpperCase()]);
                    } else {
                        res.status(404).json({});
                    }
                    delete pendingResponse[(req.params.machine_id).toUpperCase()]
                    i = 50;
                } else if (i >= 30) {
                    res.status(500).send("Timeout Waiting for data");
                } else {
                    i++
                }
            })
        }
    } else {
        res.status(404).send("No pending scan requests");
    }
})
app.get('/wait_render/:view/:machine_id', async (req, res) => {
    if (pendingScan[(req.params.machine_id).toUpperCase()] && pendingScan[(req.params.machine_id).toUpperCase()].command) {
        let i = 0;
        while (i <= 31) {
            await sleep(1000).then(() => {
                console.log(`Waiting for response...`)
                if (pendingResponse[(req.params.machine_id).toUpperCase()]) {
                    if (pendingResponse[(req.params.machine_id).toUpperCase()].status) {
                        res.status(200).render(req.params.view, {
                            ...pendingResponse[(req.params.machine_id).toUpperCase()],
                            show_delete_actions: config.show_delete_actions
                        });
                    } else {
                        res.status(404).send("Invalid Response");
                    }
                    delete pendingResponse[(req.params.machine_id).toUpperCase()]
                    i = 50;
                } else if (i >= 30) {
                    res.status(500).send("Timeout Waiting for data");
                } else {
                    i++
                }
            })
        }
    } else {
        res.status(404).send("No pending scan requests");
    }
})
app.get('/get_pending', manageAuth, (req, res) => {
    res.status(200).json(pendingScan);
})
// Register new User
app.get('/register/scan/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            const userId = `user-${(Date.now()).valueOf()}`
            const user = {
                credits: (req.query.credits && !isNaN(parseFloat(req.query.credits))) ? parseFloat(req.query.credits) : 0,
                name: (req.query.user_name) ? decodeURIComponent(req.query.user_name) : null,
                contact: (req.query.user_contact) ? decodeURIComponent(req.query.user_contact) : null,
                notes: (req.query.user_notes) ? decodeURIComponent(req.query.user_notes) : null,
                locked: false,
                free_play: false,
                date_created: Date.now().valueOf(),
            }
            db.users[userId] = user;
            console.log(`User Created: ${userId}`, user)
            pendingScan[(req.params.machine_id).toUpperCase()] = {
                command: "register_new_card",
                data: {
                    user: userId,
                    name: (req.query.card_name) ? decodeURIComponent(req.query.card_name) : null,
                    contact: (req.query.card_contact) ? decodeURIComponent(req.query.card_contact) : null,
                    locked: false
                }
            }
            clearTimeout(pendingTimeout);
            pendingTimeout = setTimeout(() => { delete pendingScan[(req.params.machine_id).toUpperCase()]; }, 30000)
            console.log(`New Pending Card for ${userId}`, pendingScan[(req.params.machine_id).toUpperCase()])
            res.status(200).send(`Waiting for card to be scanned for ${userId}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/register/scan/:machine_id/:user', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] === undefined) {
                const user = {
                    credits: (req.query.credits && !isNaN(parseFloat(req.query.credits))) ? parseFloat(req.query.credits) : 0,
                    name: (req.query.user_name) ? decodeURIComponent(req.query.user_name) : null,
                    contact: (req.query.user_contact) ? decodeURIComponent(req.query.user_contact) : null,
                    notes: (req.query.user_notes) ? decodeURIComponent(req.query.user_notes) : null,
                    locked: false,
                    free_play: false,
                    date_created: Date.now().valueOf(),
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
            pendingScan[(req.params.machine_id).toUpperCase()] = {
                command: "register_new_card",
                data: {
                    user: req.params.user,
                    name: (req.query.card_name) ? decodeURIComponent(req.query.card_name) : null,
                    contact: (req.query.card_contact) ? decodeURIComponent(req.query.card_contact) : null,
                    locked: false
                }
            }
            clearTimeout(pendingTimeout);
            pendingTimeout = setTimeout(() => { delete pendingScan[(req.params.machine_id).toUpperCase()]; }, 30000)
            console.log(`New Pending Card for ${req.params.user}`, pendingScan[(req.params.machine_id).toUpperCase()])
            res.status(200).send(`Waiting for card to be scanned for ${req.params.user}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/update/user/:user', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].free_play = (req.query.free_play && req.query.free_play === 'true');
                if (req.query.user_name && req.query.user_name.length > 0) {
                    db.users[req.params.user].name = decodeURIComponent(req.query.user_name)
                } else {
                    delete db.users[req.params.user].name
                }
                if (req.query.user_contact && req.query.user_contact.length > 0) {
                    db.users[req.params.user].contact = decodeURIComponent(req.query.user_contact)
                } else {
                    delete db.users[req.params.user].contact
                }
                if (req.query.user_notes && req.query.user_notes.length > 0) {
                    db.users[req.params.user].notes = decodeURIComponent(req.query.user_notes)
                } else {
                    delete db.users[req.params.user].notes
                }
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`User Account Updated ${req.params.user}`)
                res.status(200).send(`User Account Updated ${req.params.user}`);
            } else {
                console.error(`User account not found ${req.params.user}`)
                res.status(404).send(`User account not found ${req.params.user}`);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/register/new/:user/:card', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            const userId = (req.params.user !== 'NULL') ? req.params.user : `user-${(Date.now()).valueOf()}`
            if (db.users[userId] === undefined) {
                db.users[userId] = {
                    credits: (req.query.credits && !isNaN(parseFloat(req.query.credits))) ? parseFloat(req.query.credits) : 0,
                    name: (req.query.user_name) ? decodeURIComponent(req.query.user_name) : null,
                    contact: (req.query.user_contact) ? decodeURIComponent(req.query.user_contact) : null,
                    notes: (req.query.user_notes) ? decodeURIComponent(req.query.user_notes) : null,
                    locked: false,
                    free_play: false,
                    date_created: Date.now().valueOf(),
                };
                if (req.query.credits && !isNaN(parseFloat(req.query.credits))) {
                    db.users[userId].credits = db.users[userId].credits + parseFloat(req.query.credits);
                    if (!history.topup_log[userId])
                        history.topup_log[userId] = [];
                    history.topup_log[userId].push({
                        card: false,
                        cost: req.query.credits,
                        time: Date.now().valueOf()
                    })
                }
                let card = {
                    user: userId,
                    name: (req.query.card_name) ? decodeURIComponent(req.query.card_name) : null,
                    contact: (req.query.card_contact) ? decodeURIComponent(req.query.card_contact) : null,
                    locked: false
                }
                db.cards[req.params.card] = card;
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`New Card Created: ${req.params.card} for ${userId}`, card)
                res.status(200).send(`Registered Card ${req.params.card} for ${userId}`);
            } else {
                console.error(`Card Possibly Already Exists: ${req.params.card}`, db.cards[req.params.card])
                res.status(400).send("Card Already Exists!");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/delete/user/:user', manageAuth, (req, res) => {
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
        res.status(500).send('Server Error');
    }
});
app.get('/delete/scan/user/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan[(req.params.machine_id).toUpperCase()] = {
                command: "delete_user",
                data: {

                }
            }
            clearTimeout(pendingTimeout);
            pendingTimeout = setTimeout(() => { delete pendingScan[(req.params.machine_id).toUpperCase()]; }, 30000)
            console.log(`New Pending Account Deletion`)
            res.status(200).send(`Waiting for card to be scanned for user delete operation`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
// Card Management
app.get('/set/card/lock/:card/:value', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                db.cards[req.params.card].locked = (req.params.value === "enable");
                res.status(200).send("Card is " + ((req.params.value === "enable") ? "locked: " : "unlocked: ") + req.params.card);
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log("Card is " + ((req.params.value === "enable") ? "locked: " : "unlocked: ") + req.params.card)
            } else {
                res.status(400);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/reassign/card/:user/:card', manageAuth, (req, res) => {
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
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/reassign/scan/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan[(req.params.machine_id).toUpperCase()] = {
                command: "transfer_card",
                data: {

                }
            }
            clearTimeout(pendingTimeout);
            pendingTimeout = setTimeout(() => { delete pendingScan[(req.params.machine_id).toUpperCase()]; }, 30000)
            console.log(`New Pending Card Transfer`)
            res.status(200).send(`Waiting for card to be scanned for card transfer operation`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/update/card/:card', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                if (req.query.card_name && req.query.card_name.length > 0) {
                    db.cards[req.params.card].name = decodeURIComponent(req.query.card_name)
                } else {
                    delete db.cards[req.params.card].name
                }
                if (req.query.card_contact && req.query.card_contact.length > 0) {
                    db.cards[req.params.card].contact = decodeURIComponent(req.query.card_contact)
                } else {
                    delete db.cards[req.params.card].contact
                }
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`Card Updated ${req.params.card}`)
                res.status(200).send(`Card Updated ${req.params.card}`);
            } else {
                console.error(`Card not found ${req.params.card}`)
                res.status(404).send(`Card not found ${req.params.card}`);
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/delete/scan/card/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan[(req.params.machine_id).toUpperCase()] = {
                command: "delete_card",
                data: {

                }
            }
            clearTimeout(pendingTimeout);
            pendingTimeout = setTimeout(() => { delete pendingScan[(req.params.machine_id).toUpperCase()]; }, 30000)
            console.log(`New Pending Card Deletion`)
            res.status(200).send(`Waiting for card to be scanned for card delete operation`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send("Internal System Error");
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/delete/card/:card', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined) {
                delete db.cards[req.params.card];
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
        res.status(500).send('Server Error');
    }
});
// User Management
app.get('/set/user/lock/:user/:value', manageAuth, (req, res) => {
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
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/user/freeplay/:user/:value', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.users[req.params.user] !== undefined) {
                db.users[req.params.user].free_play = (req.params.value === "enable");
                if (req.query.timeLimit && !isNaN(parseFloat(req.query.timeLimit))) {
                    db.users[req.params.user].free_play_time_limit = (Date.now().valueOf() + (parseFloat(req.query.timeLimit) * 3600000));
                } else {
                    delete db.users[req.params.user].free_play_time_limit
                }
                res.status(200).send(((req.params.value === "enable") ? "User is in Freeplay: " : "User is in credit mode: ") + req.params.user);
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(((req.params.value === "enable") ? "User is in Freeplay: " : "User is in credit mode: ") + req.params.user)
            } else {
                res.status(404).send("Unknown User");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/card/freeplay/:card/:value', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.cards[req.params.card] !== undefined && db.users[db.cards[req.params.card].user] !== undefined) {
                db.users[db.cards[req.params.card].user].free_play = (req.params.value === "enable");
                if (req.query.timeLimit && !isNaN(parseFloat(req.query.timeLimit))) {
                    db.users[db.cards[req.params.card].user].free_play_time_limit = (Date.now().valueOf() + (parseFloat(req.query.timeLimit) * 3600000));
                } else {
                    delete db.users[db.cards[req.params.card].user].free_play_time_limit
                }
                res.status(200).send(((req.params.value === "enable") ? "User is in Freeplay: " : "User is in credit mode: ") + req.params.card);
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(((req.params.value === "enable") ? "User is in Freeplay: " : "User is in credit mode: ") + req.params.card)
            } else {
                res.status(404).send("Unknown Card");
            }
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/scan/freeplay/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            pendingScan[(req.params.machine_id).toUpperCase()] = {
                command: "freeplay_card",
                data: {
                    time: (req.query.timeLimit) ? parseFloat(req.query.timeLimit) : null
                }
            }
            clearTimeout(pendingTimeout);
            pendingTimeout = setTimeout(() => { delete pendingScan[(req.params.machine_id).toUpperCase()]; }, 30000)
            res.status(200).send(`Waiting for card to be scanned to enable freeplay`);
            console.log(`Pending Card Freeplay`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/disable_freeplay/user', manageAuth, (req, res) => {
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
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
if (config.allow_delete_orphaned_actions) {
    app.get('/clear_dead_account_data', manageAuth, (req, res) => {
        if (db.cards && db.users) {
            try {
                Object.keys(history.dispense_log).filter(e => db.users[e] === undefined).map(e => {
                    delete history.dispense_log[e]
                })
                Object.keys(history.topup_log).filter(e => db.users[e] === undefined).map(e => {
                    delete history.topup_log[e]
                })
                Object.keys(history.machines_dispense).filter(e => db.machines[e] === undefined).map(e => {
                    delete history.machines_dispense[e]
                })
                Object.entries(db.cards).filter(e => db.users[e[1].user] === undefined).map(e => {
                    delete db.cards[e[0]]
                })
                res.status(200).send("Deleted all orphaned data");
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveDatabase, 5000);
                console.log(`Users are all in credit mode`)
            } catch (e) {
                console.error("Failed to read cards database", e)
                res.status(500).send('Server Error');
            }
        } else {
            res.status(500).send('Server Error');
        }
    })
}

// Machine Management
app.get('/create/pos/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].pos_mode = true;
            if (req.query.name && req.query.name.length > 0)
                db.machines[(req.params.machine_id).toUpperCase()].name = req.query.name;
            if (req.query.location && req.query.location.length > 0)
                db.machines[(req.params.machine_id).toUpperCase()].location = req.query.location;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`POS Terminal ${(req.params.machine_id).toUpperCase()} created`)
            res.status(200).send(`POS Terminal ${(req.params.machine_id).toUpperCase()} created`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/cost/:machine_id/:cost', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].cost = parseFloat(req.params.cost)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} now costs ${req.params.cost}`)
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} now costs ${req.params.cost}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/discount/:machine_id/:tap/:time/:cost', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            if (req.params.cost === "null") {
                delete db.machines[(req.params.machine_id).toUpperCase()].discount_tap;
                delete db.machines[(req.params.machine_id).toUpperCase()].discount_cost;
                delete db.machines[(req.params.machine_id).toUpperCase()].discount_sec;
            } else {
                db.machines[(req.params.machine_id).toUpperCase()].discount_tap = parseInt(req.params.tap);
                db.machines[(req.params.machine_id).toUpperCase()].discount_cost = parseFloat(req.params.cost);
                db.machines[(req.params.machine_id).toUpperCase()].discount_sec = parseFloat(req.params.time);
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} discount is ${req.params.cost} after ${req.params.tap} tap(s)`)
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} discount is ${req.params.cost} after ${req.params.tap} tap(s)`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/name/:machine_id/:name', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].name = req.params.name
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} is named ${req.params.name}`);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} is named ${req.params.name}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/antihog/:machine_id/:tap/:min', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].antihog_trigger = req.params.tap;
            db.machines[(req.params.machine_id).toUpperCase()].antihog_min = req.params.min;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} antihog is ${req.params.tap} for ${req.params.min}min`);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} antihog is ${req.params.tap} for ${req.params.min}min`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/cooldown/:machine_id/:tap/:min', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].cooldown_trigger = req.params.tap;
            db.machines[(req.params.machine_id).toUpperCase()].cooldown_min = req.params.min;
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} cooldown is ${req.params.tap} for ${req.params.min}min`);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} cooldown is ${req.params.tap} for ${req.params.min}min`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/vfd/:machine_id/:ip_address/:port', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].vfd = `http://${req.params.ip_address}:${req.params.port}`
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} now has a VFD enabled`);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} now has a VFD enabled`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/button/:machine_id/:api_endpoint', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].button_callback = decodeURIComponent(req.params.api_endpoint)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} now has a button function: ${db.machines[(req.params.machine_id).toUpperCase()].button_callback}`);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} now has a button function: ${db.machines[(req.params.machine_id).toUpperCase()].button_callback}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/blocked_callback/:machine_id/:api_endpoint', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            if (req.params.api_endpoint === null) {
                delete db.machines[(req.params.machine_id).toUpperCase()].blocked_callback;
                delete db.machines[(req.params.machine_id).toUpperCase()].has_blocked_callback;
            } else {
                db.machines[(req.params.machine_id).toUpperCase()].blocked_callback = decodeURIComponent(req.params.api_endpoint);
                db.machines[(req.params.machine_id).toUpperCase()].has_blocked_callback = true;
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} now has a blocked callback function: ${db.machines[(req.params.machine_id).toUpperCase()].blocked_callback}`);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} now has a blocked callback function: ${db.machines[(req.params.machine_id).toUpperCase()].blocked_callback}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/withdraw_callback/:machine_id/:api_endpoint', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            if (req.params.api_endpoint === null) {
                delete db.machines[(req.params.machine_id).toUpperCase()].withdraw_callback;
            } else {
                db.machines[(req.params.machine_id).toUpperCase()].withdraw_callback = decodeURIComponent(req.params.api_endpoint);
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(`Machine ${(req.params.machine_id).toUpperCase()} now has a withdraw callback function: ${db.machines[(req.params.machine_id).toUpperCase()].withdraw_callback}`);
            console.log(`Machine ${(req.params.machine_id).toUpperCase()} now has a blocked withdraw function: ${db.machines[(req.params.machine_id).toUpperCase()].withdraw_callback}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/freeplay/:machine_id/:value', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].free_play = (req.params.value === "enable");
            if (req.query.timeLimit && !isNaN(parseFloat(req.query.timeLimit))) {
                db.machines[(req.params.machine_id).toUpperCase()].free_play_time_limit = (Date.now().valueOf() + (parseFloat(req.query.timeLimit) * 3600000));
            } else {
                delete db.machines[(req.params.machine_id).toUpperCase()].free_play_time_limit
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send(((req.params.value === "enable") ? "Machine is in Freeplay: " : "Machine is in credit mode: ") + (req.params.machine_id).toUpperCase());
            console.log(((req.params.value === "enable") ? "Machine is in Freeplay: " : "Machine is in credit mode: ") + (req.params.machine_id).toUpperCase())
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/machine/japanese/:machine_id/:value', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (db.machines[(req.params.machine_id).toUpperCase()] === undefined) {
                db.machines[(req.params.machine_id).toUpperCase()] = {};
            }
            db.machines[(req.params.machine_id).toUpperCase()].japanese = (req.params.value === "enable");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Machine VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"));
            console.log("Machine VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"))
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/delete/machine/:machine_id', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            db.machines[(req.params.machine_id).toUpperCase()] = null;
            delete db.machines[(req.params.machine_id).toUpperCase()];
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Machine deleted: " + (req.params.machine_id).toUpperCase());
            console.log("Machine deleted: " + (req.params.machine_id).toUpperCase());
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/get/dispense/machine', manageAuth, (req, res) => {
    if (history.machines_dispense) {
        try {
            res.status(200).json(history.machines_dispense)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
// Arcade Management
app.get('/get/free_play', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            res.status(200).render('free_play-config', {
                arcade: db.free_play,
                machines: Object.entries(db.machines).filter(e => !e[1].pos_mode).map(e => {
                    return {
                        id: e[0],
                        ...e[1]
                    }
                })
            });
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/cost/:cost', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            db.cost = parseFloat(req.params.cost)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Arcade global costs is ${req.params.cost}`)
            res.status(200).send(`Arcade global costs is ${req.params.cost}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/discount/:tap/:time/:cost', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            if (req.params.cost === "null") {
                delete db.discount_tap;
                delete db.discount_cost;
                delete db.discount_sec;
            } else {
                db.discount_tap = parseInt(req.params.tap);
                db.discount_cost = parseFloat(req.params.cost);
                db.discount_sec = parseFloat(req.params.time);
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Arcade global multi-credit discount costs is ${req.params.cost} after ${req.params.tap} scan(s)`)
            res.status(200).send(`Arcade global multi-credit discount costs is ${req.params.cost} after ${req.params.tap} scan(s)`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/low_balance/:balance', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            db.low_balance = parseFloat(req.params.balance)
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            console.log(`Arcade low credits warning value is ${req.params.balance}`)
            res.status(200).send(`Arcade low credits warning value is ${req.params.balance}`);
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/currency/:multiplyer', manageAuth, (req, res) => {
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
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/freeplay/:value', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            db.free_play = (req.params.value === "enable");
            if (req.query.timeLimit && !isNaN(parseFloat(req.query.timeLimit))) {
                db.free_play_time_limit = (Date.now().valueOf() + (parseFloat(req.query.timeLimit) * 3600000));
            } else {
                delete db.free_play_time_limit
            }
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Global free play is " + ((req.params.value === "enable") ? "enabled" : "disabled"));
            console.log(`Global free_play is ${(req.params.value === "enable") ? "enabled" : "disabled"}`)
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/cooldown/:tap/:min', manageAuth, (req, res) => {
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
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/antihog/:tap/:min', manageAuth, (req, res) => {
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
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});
app.get('/set/arcade/japanese/:value', manageAuth, (req, res) => {
    if (db.cards && db.users) {
        try {
            db.jpn = (req.params.value === "enable");
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDatabase, 5000);
            res.status(200).send("Global VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"));
            console.log("Global VFD Japanese is " + ((req.params.value === "enable") ? "enabled" : "disabled"))
        } catch (e) {
            console.error("Failed to read cards database", e)
            res.status(500).send('Server Error');
        }
    } else {
        res.status(500).send('Server Error');
    }
});

app.listen(port, () => {
    console.log(`Card server is running on http://0.0.0.0:${port}`);
});
