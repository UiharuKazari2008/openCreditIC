function cancelRequest() {
    let machineID = document.getElementById('posTerminal').value;
    $.ajax({
        type: "GET", data: '',
        processData: false,
        contentType: false,
        cache: false,
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
        url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (createCard) {
                    clearRegisterUser();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    $.ajax({
                        type: "GET",
                        url: `/wait_pending/${machineID}`,
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
    let request = new URLSearchParams();
    const showUserID = document.getElementById('showUserID').value;
    try {
        const showFreePlayUser = document.getElementById('showFreePlayUser').checked;
        const showUserName = document.getElementById('showUserName').value;
        const showUserContact = document.getElementById('showUserContact').value;
        if (showFreePlayUser)
            request.set('free_play', showFreePlayUser.toString())
        if (showUserName && showUserName.trim().length > 0) {
            request.set('user_name', encodeURIComponent(showUserName.trim()));
        }
        if (showUserContact && showUserContact.trim().length > 0) {
            request.set('user_contact', encodeURIComponent(showUserContact.trim()));
        }
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    const url = `/update/user/${showUserID}?${request.toString()}`
    $.ajax({
        type: "GET",
        url, data: '',
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
    let request = new URLSearchParams();
    try {
        const showCardName = document.getElementById('cardName' + card_number).value;
        const showCardContact = document.getElementById('cardContact' + card_number).value;
        if (showCardName && showCardName.trim().length > 0) {
            request.set('card_name', encodeURIComponent(showCardName.trim()));
        }
        if (showCardContact && showCardContact.trim().length > 0) {
            request.set('card_contact', encodeURIComponent(showCardContact.trim()));
        }
    } catch (e) {
        console.error(`Failed to parse user info`, e)
    }
    const url = `/update/card/${card_number}?${request.toString()}`
    $.ajax({
        type: "GET",
        url, data: '',
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
    const model = $('#showUserModel')
    let userId = false;
    let cardId = false;
    let request = new URLSearchParams();
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
    const url = `/get/${(userId) ? ('rendered/user/' + userId) : (cardId) ? ('rendered/card/' + cardId) : 'scan/' + machineID}?${request.toString()}`
    $.ajax({
        type: "GET",
        url, data: '',
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
                    $.ajax({
                        type: "GET",
                        url: `/wait_render/user-data/${machineID}`,
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
    $.ajax({
        type: "GET",
        url: "/get/free_play",
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
    const url = `/deposit/${(userID) ? ('user/' + userID) : ((cardID) ? ('card/' + cardID) : ('scan/' + machineID))}/${credits}`
    $.ajax({
        type: "GET",
        url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                if (userID || cardID) {
                    clearDepositCredits();
                } else {
                    $("#waitForCardScanModal").modal("show");
                    $.ajax({
                        type: "GET",
                        url: `/wait_pending/${machineID}`,
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
    const url = `/reassign/scan/${machineID}`
    $.ajax({
        type: "GET",
        url, data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $("#waitForCardScanModal").modal("show");
                $.ajax({
                    type: "GET",
                    url: `/wait_pending/${machineID}`,
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
    $.ajax({
        type: "GET",
        url: url + '/' + machineID,
        data: '',
        processData: false,
        contentType: false,
        cache: false,
        success: function (res, txt, xhr) {
            if (xhr.status === 200) {
                $("#waitForCardScanModal").modal("show");
                $.ajax({
                    type: "GET",
                    url: `/wait_pending/${machineID}`,
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
        $.ajax({
            type: "GET",
            url: '/register/scan/' + machineID + '/' + userID,
            data: '',
            processData: false,
            contentType: false,
            cache: false,
            success: function (res, txt, xhr) {
                if (xhr.status === 200) {
                    $("#waitForCardScanModal").modal("show");
                    $.ajax({
                        type: "GET",
                        url: `/wait_pending/${machineID}`,
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
    $.ajax({
        type: "GET",
        url: url + ((machine_id) ? machine_id + '/' : '') + ((document.getElementById(('showFreePlay' + ((machine_id) ? machine_id : 'Global'))).checked) ? 'disable' : 'enable'),
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
    $.ajax({
        type: "GET",
        url,
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
    const url = `/disable_freeplay/user`
    $.ajax({
        type: "GET",
        url, data: '',
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
function clearUser() {
    $("#findUserModal").modal("hide");
    $("#showUserModel").modal("hide");
    document.getElementById('findCustomerID').value = '';
    document.getElementById('findCardNumber').value = '';
    $('#userDataDiv').html('<span></span>')
}
