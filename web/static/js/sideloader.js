function cancelRequest() {
    let machineID = document.getElementById('posTerminal').value;
    $.ajax({
        type: "GET",
        url: `/cancel_pending/${machineID}`,
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
    let request = new URLSearchParams();
    let createUser = false
    let createCard = false
    let machineID = document.getElementById('posTerminal').value;
    try {
        const val = parseFloat(document.getElementById('initialBalance').value)
        if (!isNaN(val) && val > 0)
            request.set('credits', val.toString())
    } catch (e) {
        console.error(`Failed to parse balance`, e)
    }
    try {
        const userID = document.getElementById('userID').value
        const userName = document.getElementById('userName').value
        const userContact = document.getElementById('userContact').value
        if (userID && userID.trim().length > 0)
            createUser = userID.trim();
        if (userName && userName.trim().length > 0)
            request.set('user_name', encodeURIComponent(userName.trim()));
        if (userContact && userContact.trim().length > 0)
            request.set('user_contact', encodeURIComponent(userContact.trim()));
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
            request.set('card_name', encodeURIComponent(cardName.trim()));
        if (cardContact && cardContact.trim().length > 0)
            request.set('card_contact', encodeURIComponent(cardContact.trim()));
    } catch (e) {
        console.error(`Failed to parse card info`, e)
    }
    const url = `/register/${(createCard) ? 'new' : 'scan'}/${machineID}${(createUser) ? '/' + createUser : ''}?${request.toString()}`
    $.ajax({
        type: "GET",
        url,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (createUser || createCard) {
                    clearRegisterUser();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    $.ajax({
                        type: "GET",
                        url: `/wait_pending/${machineID}`,
                        timeout: 60000,
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
    const url = `/deposit/${(userID) ? ('user/' + userID) : ((cardID) ? ('card/' + cardID) : ('scan/' + machineID))}/${credits}`
    $.ajax({
        type: "GET",
        url,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (userID || cardID) {
                    clearDepositCredits();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    $.ajax({
                        type: "GET",
                        url: `/wait_pending/${machineID}`,
                        timeout: 60000,
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
    const url = `/${(userID) ? ('set/user/freeplay/' + userID + '/enabled') : ((cardID) ? ('set/card/freeplay/' + cardID + '/enabled') : ('scan/freeplay/' + machineID))}`
    $.ajax({
        type: "GET",
        url,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (userID || cardID) {
                    clearDepositCredits();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    $.ajax({
                        type: "GET",
                        url: `/wait_pending/${machineID}`,
                        timeout: 60000,
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
    const url = `/reassign/scan/${machineID}`
    $.ajax({
        type: "GET",
        url,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $("#waitForCardScanModal").modal("show");
                $.ajax({
                    type: "GET",
                    url: `/wait_pending/${machineID}`,
                    timeout: 60000,
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
function clearAllFreeplay() {
    const url = `/disable_freeplay/user`
    $.ajax({
        type: "GET",
        url,
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
    document.getElementById('cardNum').value = '';
    document.getElementById('cardName').value = '';
    document.getElementById('cardContact').value = '';
}

function clearDepositCredits() {
    $("#depositModal").modal("hide");
    $("#waitForCardScanModal").modal("hide");
    document.getElementById('depositBalance').value = '';
    document.getElementById('depositUser').value = '';
    document.getElementById('depositCard').value = '';
}
