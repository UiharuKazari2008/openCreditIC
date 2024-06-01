const searchParams = new URLSearchParams(document.location.search);
const key = (typeof SEQ_APP_URL !== 'undefined') ? false : (searchParams.has('key')) ? searchParams.get('key') : false
function cancelRequest() {
    let machineID = document.getElementById('posTerminal').value;
    let _url = new URL(`${document.location.origin}/cancel_pending/${machineID}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);

    $.ajax({
        type: "GET", data: '',
        processData: false,
        contentType: false,
        cache: false,
        url: _url,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $("#waitForCardScanModal").modal("hide");
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            $("#waitForCardScanModal").modal("hide");
            alert(`Failure: ${xhr.responseText}`)
        },
    });
}
function registerUser() {
    const model = $('#newCardModal')
    let _url = new URL(`${document.location.origin}`);
    if (key)
        _url.searchParams.set('key', key);
    let createUser = false
    let createCard = false
    let machineID = document.getElementById('posTerminal').value;
    _url.searchParams.set('key', key);
    try {
        const val = parseFloat(document.getElementById('initialBalance').value)
        if (!isNaN(val) && val > 0)
            _url.searchParams.set('credits', val.toString())
    } catch (e) {
        console.error(`Failed to parse balance`, e)
    }
    try {
        const userID = document.getElementById('userID').value
        const userName = document.getElementById('userName').value
        const userContact = document.getElementById('userContact').value
        const userNotes = document.getElementById('userNotes').value
        if (userID && userID.trim().length > 0)
            createUser = userID.trim();
        if (userName && userName.trim().length > 0)
            _url.searchParams.set('user_name', encodeURIComponent(userName.trim()));
        if (userContact && userContact.trim().length > 0)
            _url.searchParams.set('user_contact', encodeURIComponent(userContact.trim()));
        if (userNotes && userNotes.trim().length > 0)
            _url.searchParams.set('user_notes', encodeURIComponent(userNotes.trim()));
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    try {
        const cardSN = document.getElementById('cardNum').value
        const cardName = document.getElementById('cardName').value
        const cardContact = document.getElementById('cardContact').value
        if (cardSN && cardSN.trim().length > 0)
            createCard = cardSN.trim();
        if (cardName && cardName.trim().length > 0)
            _url.searchParams.set('card_name', encodeURIComponent(cardName.trim()));
        if (cardContact && cardContact.trim().length > 0)
            _url.searchParams.set('card_contact', encodeURIComponent(cardContact.trim()));
    } catch (e) {
        console.error(`Failed to parse card info`, e)
    }
    _url.pathname = ((typeof SEQ_APP_URL !== 'undefined') ? SEQ_APP_URL : '') + `/register/${(createCard) ? 'new' : 'scan'}/${(createCard) ? ((createUser) ? createUser : 'NULL') + '/' + createCard : machineID + ((createUser) ? '/' + createUser : '')}`;
    $.ajax({
        type: "GET",
        url: _url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (createCard) {
                    clearRegisterUser();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    let _url2 = new URL(`${document.location.origin}/wait_pending/${machineID}`);
                    if (typeof SEQ_APP_URL !== 'undefined')
                        _url2.pathname = SEQ_APP_URL + _url2.pathname;
                    if (key)
                        _url2.searchParams.set('key', key);

                    $.ajax({
                        type: "GET",
                        url: _url2,
                        timeout: 60000, data: '',
                        processData: false,
                        contentType: false,
                        success: function () {
                            $("#waitForCardScanModal").modal("hide");
                            clearRegisterUser();
                        },
                        error: function () {
                            alert(`Request Timeout`);
                        },
                    });
                }
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function updateUserData() {
    const showUserID = document.getElementById('showUserID').value;
    let _url = new URL(`${document.location.origin}/update/user/${showUserID}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    try {
        const showFreePlayUser = document.getElementById('showFreePlayUser').checked;
        const showUserName = document.getElementById('showUserName').value;
        const showUserContact = document.getElementById('showUserContact').value;
        const showUserNotes = document.getElementById('showUserNotes').value;
        if (showFreePlayUser)
            _url.searchParams.set('free_play', showFreePlayUser.toString())
        if (showUserName && showUserName.trim().length > 0) {
            _url.searchParams.set('user_name', encodeURIComponent(showUserName.trim()));
        }
        if (showUserContact && showUserContact.trim().length > 0) {
            _url.searchParams.set('user_contact', encodeURIComponent(showUserContact.trim()));
        }
        if (showUserNotes && showUserNotes.trim().length > 0) {
            _url.searchParams.set('user_notes', encodeURIComponent(showUserNotes.trim()));
        }
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    $.ajax({
        type: "GET",
        url: _url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                clearUser();
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function updateCardData(card_number) {
    let _url = new URL(`${document.location.origin}/update/card/${card_number}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    try {
        const showCardName = document.getElementById('cardName' + card_number).value;
        const showCardContact = document.getElementById('cardContact' + card_number).value;
        if (showCardName && showCardName.trim().length > 0) {
            _url.searchParams.set('card_name', encodeURIComponent(showCardName.trim()));
        }
        if (showCardContact && showCardContact.trim().length > 0) {
            _url.searchParams.set('card_contact', encodeURIComponent(showCardContact.trim()));
        }
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    $.ajax({
        type: "GET",
        url: _url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                clearUser();
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function getUser() {
    let _url = new URL(`${document.location.origin}`);
    if (key)
        _url.searchParams.set('key', key);
    const model = $('#showUserModel')
    let userId = false;
    let cardId = false;
    let machineID = document.getElementById('posTerminal').value;
    try {
        const userID = document.getElementById('findCustomerID').value
        if (userID && userID.trim().length > 0)
            userId = userID.trim();
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    try {
        const cardSN = document.getElementById('findCardNumber').value
        if (cardSN && cardSN.trim().length > 0)
            cardId = cardSN.trim();
    } catch (e) {
        console.error(`Failed to parse card info`, e)
    }
    _url.pathname = ((typeof SEQ_APP_URL !== 'undefined') ? SEQ_APP_URL :  '') + `/get/${(userId) ? ('rendered/user/' + userId) : (cardId) ? ('rendered/card/' + cardId) : 'scan/' + machineID}`
    $.ajax({
        type: "GET",
        url: _url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $("#findUserModal").modal("hide");
                if (userId || cardId) {
                    $('#userDataDiv').html(res);
                    $("#showUserModel").modal("show");
                } else {
                    $("#waitForCardScanModal").modal("show");
                    let _url2 = new URL(`${document.location.origin}/wait_render/user-data/${machineID}`);
                    if (typeof SEQ_APP_URL !== 'undefined')
                        _url2.pathname = SEQ_APP_URL + _url2.pathname;
                    if (key)
                        _url2.searchParams.set('key', key);
                    $.ajax({
                        type: "GET",
                        url: _url2,
                        timeout: 60000, data: '',
                        processData: false,
                        contentType: false,
                        success: function (res, txt, xhr) {
                            $("#waitForCardScanModal").modal("hide");
                            if (xhr.status === 200) {
                                $('#userDataDiv').html(res);
                                $("#showUserModel").modal("show");
                            } else {
                                alert(res);
                            }
                        },
                        error: function () {
                            alert(`Request Timeout`);
                        },
                    });
                }
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function getFreePlay() {
    let _url = new URL(`${document.location.origin}/get/free_play`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    $.ajax({
        type: "GET",
        url: _url,
        data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $('#freeplayDataDiv').html(res);
                $("#showFreePlayModel").modal("show");
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function depositCredits() {
    const model = $('#depositModal')
    let userID = false
    let cardID = false
    let credits = false
    let machineID = document.getElementById('posTerminal').value;
    try {
        const val = parseFloat(document.getElementById('depositBalance').value)
        if (!isNaN(val) && val > 0)
            credits = val;
    } catch (e) {
        console.error(`Failed to parse balance`, e)
    }
    try {
        const depositUser = document.getElementById('depositUser').value
        if (depositUser && depositUser.trim().length > 0)
            userID = depositUser.trim();
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    try {
        const depositCard = document.getElementById('depositCard').value
        if (depositCard && depositCard.trim().length > 0)
            cardID = depositCard.trim();
    } catch (e) {
        console.error(`Failed to parse card info`, e)
    }
    let _url
    if (document.getElementById('collapseDepositFreeplay').classList.contains('show')) {
        _url = new URL(`${document.location.origin}/${(userID) ? ('set/user/freeplay/' + userID + '/enabled') : ((cardID) ? ('set/card/freeplay/' + cardID + '/enabled') : ('scan/freeplay/' + machineID))}`);
        try {
            const val = parseFloat(document.getElementById('freeplayTimeLimit').value)
            if (!isNaN(val) && val > 0)
                _url.searchParams.set('timeLimit', val);
        } catch (e) {
            console.error(`Failed to parse freeplay time`, e)
        }
    } else {
        _url = new URL(`${document.location.origin}/deposit/${(userID) ? ('user/' + userID) : ((cardID) ? ('card/' + cardID) : ('scan/' + machineID))}/${credits}`);
    }
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    $.ajax({
        type: "GET",
        url: _url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (userID || cardID) {
                    clearDepositCredits();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    let _url2 = new URL(`${document.location.origin}/wait_pending/${machineID}`);
                    if (typeof SEQ_APP_URL !== 'undefined')
                        _url2.pathname = SEQ_APP_URL + _url2.pathname;
                    if (key)
                        _url2.searchParams.set('key', key);

                    $.ajax({
                        type: "GET",
                        url: _url2,
                        timeout: 60000, data: '',
                        processData: false,
                        contentType: false,
                        success: function () {
                            $("#waitForCardScanModal").modal("hide");
                            clearDepositCredits();
                        },
                        error: function () {
                            alert(`Request Timeout`);
                        },
                    });
                }
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function freePlayUser() {
    const model = $('#depositModal')
    let userID = false
    let cardID = false
    let machineID = document.getElementById('posTerminal').value;
    try {
        const depositUser = document.getElementById('depositUser').value
        if (depositUser && depositUser.trim().length > 0)
            userID = depositUser.trim();
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    try {
        const depositCard = document.getElementById('depositCard').value
        if (depositCard && depositCard.trim().length > 0)
            cardID = depositCard.trim();
    } catch (e) {
        console.error(`Failed to parse card info`, e)
    }
    let _url = new URL(`${document.location.origin}/${(userID) ? ('set/user/freeplay/' + userID + '/enabled') : ((cardID) ? ('set/card/freeplay/' + cardID + '/enabled') : ('scan/freeplay/' + machineID))}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    $.ajax({
        type: "GET",
        url: _url,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (userID || cardID) {
                    clearDepositCredits();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    let _url2 = new URL(`${document.location.origin}/wait_pending/${machineID}`);
                    if (typeof SEQ_APP_URL !== 'undefined')
                        _url2.pathname = SEQ_APP_URL + _url2.pathname;
                    if (key)
                        _url2.searchParams.set('key', key);

                    $.ajax({
                        type: "GET",
                        url: _url2,
                        timeout: 60000, data: '',
                        processData: false,
                        contentType: false,
                        success: function () {
                            $("#waitForCardScanModal").modal("hide");
                            clearDepositCredits();
                        },
                        error: function () {
                            alert(`Request Timeout`);
                        },
                    });
                }
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function transferCard() {
    let machineID = document.getElementById('posTerminal').value;
    let _url = new URL(`${document.location.origin}/reassign/scan/${machineID}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    $.ajax({
        type: "GET",
        url: _url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $("#waitForCardScanModal").modal("show");
                let _url2 = new URL(`${document.location.origin}/wait_pending/${machineID}`);
                if (typeof SEQ_APP_URL !== 'undefined')
                    _url2.pathname = SEQ_APP_URL + _url2.pathname;
                if (key)
                    _url2.searchParams.set('key', key);
                $.ajax({
                    type: "GET",
                    url: _url2,
                    timeout: 60000, data: '',
                    processData: false,
                    contentType: false,
                    success: function () {
                        $("#waitForCardScanModal").modal("hide");
                        clearDepositCredits();
                    },
                    error: function () {
                        alert(`Request Timeout`);
                    },
                });
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function cardAction(url) {
    let machineID = document.getElementById('posTerminal').value;
    let _url = new URL(`${document.location.origin}${url}/${machineID}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    $.ajax({
        type: "GET",
        url: _url,
        data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $("#waitForCardScanModal").modal("show");
                let _url2 = new URL(`${document.location.origin}/wait_pending/${machineID}`);
                if (typeof SEQ_APP_URL !== 'undefined')
                    _url2.pathname = SEQ_APP_URL + _url2.pathname;
                if (key)
                    _url2.searchParams.set('key', key);
                $.ajax({
                    type: "GET",
                    url: _url2,
                    timeout: 60000, data: '',
                    processData: false,
                    contentType: false,
                    success: function () {
                        $("#waitForCardScanModal").modal("hide");
                        clearDepositCredits();
                    },
                    error: function () {
                        alert(`Request Timeout`);
                    },
                });
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function addCardToUser() {
    let machineID = document.getElementById('posTerminal').value;
    if (document.getElementById('showUserID') !== undefined) {
        const userID = document.getElementById('showUserID').value;
        let _url = new URL(`${document.location.origin}/register/scan/${machineID}/${userID}`);
        if (typeof SEQ_APP_URL !== 'undefined')
            _url.pathname = SEQ_APP_URL + _url.pathname;
        if (key)
            _url.searchParams.set('key', key);
        $.ajax({
            type: "GET",
            url: _url,
            data: '',
            processData: false,
            contentType: false,
            cache: false,
            success: function (res, txt, xhr) {
                if (xhr.status === 200) {
                    $("#waitForCardScanModal").modal("show");
                    let _url2 = new URL(`${document.location.origin}/wait_pending/${machineID}`);
                    if (typeof SEQ_APP_URL !== 'undefined')
                        _url2.pathname = SEQ_APP_URL + _url2.pathname;
                    if (key)
                        _url2.searchParams.set('key', key);
                    $.ajax({
                        type: "GET",
                        url: _url2,
                        timeout: 60000, data: '',
                        processData: false,
                        contentType: false,
                        success: function () {
                            $("#waitForCardScanModal").modal("hide");
                            clearUser();
                        },
                        error: function () {
                            alert(`Request Timeout`);
                        },
                    });
                } else {
                    alert(res)
                }
            },
            error: function (xhr) {
                alert(`Failure: ${xhr.responseText}`)
            },
        });
    } else {
        alert("No User ID found")
    }
    return false
}
function setFreeplay(url, machine_id) {
    let _url = new URL(`${document.location.origin}${url}${((machine_id) ? machine_id + '/' : '')}${((document.getElementById(('showFreePlay' + ((machine_id) ? machine_id : 'Global'))).checked) ? 'disable' : 'enable')}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    $.ajax({
        type: "GET",
        url: _url,
        data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                alert(res)
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function generalAction(url) {
    let _url = new URL(`${document.location.origin}${url}`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);

    $.ajax({
        type: "GET",
        url: _url,
        data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                alert(res)
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}
function clearAllFreeplay() {
    let _url = new URL(`${document.location.origin}/disable_freeplay/user`);
    if (typeof SEQ_APP_URL !== 'undefined')
        _url.pathname = SEQ_APP_URL + _url.pathname;
    if (key)
        _url.searchParams.set('key', key);
    $.ajax({
        type: "GET",
        url: _url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                alert(res)
            } else {
                alert(res)
            }
        },
        error: function (xhr) {
            alert(`Failure: ${xhr.responseText}`)
        },
    });
    return false
}

function clearRegisterUser() {
    $("#newCardModal").modal("hide");
    $("#waitForCardScanModal").modal("hide");
    document.getElementById('initialBalance').value = '';
    document.getElementById('userID').value = '';
    document.getElementById('userName').value = '';
    document.getElementById('userContact').value = '';
    document.getElementById('userNotes').value = '';
    document.getElementById('cardNum').value = '';
    document.getElementById('cardName').value = '';
    document.getElementById('cardContact').value = '';
}
function clearDepositCredits() {
    $("#depositModal").modal("hide");
    $("#waitForCardScanModal").modal("hide");
    document.getElementById('depositBalance').value = '';
    document.getElementById('depositUser').value = '';
    document.getElementById('freeplayTimeLimit').value = '';
    document.getElementById('depositCard').value = '';
}
function clearUser() {
    $("#findUserModal").modal("hide");
    $("#showUserModel").modal("hide");
    document.getElementById('findCustomerID').value = '';
    document.getElementById('findCardNumber').value = '';
    $('#userDataDiv').html('<span></span>')
}
