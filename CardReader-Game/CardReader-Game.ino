#include <Wire.h>
#include <Adafruit_PN532.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WebServer.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <U8g2lib.h>  // Include the U8g2 library for OLED display.
#include <ArduinoJson.h>
#include <FastLED.h>
#include "images.h"
#include "config.h"
#include "melody.h"

#define SS_PIN 5      // Define the SS pin (Slave Select) for the RFID module.
#define RST_PIN 15     // Define the RST pin for the RFID module.
#define RELAY_PIN 13   // Define the pin connected to the relay.
#define BLOCK_PIN 14   // Define the pin connected to the LDR for Coin Blocking from cab
#define BUTTON_PIN 4   // Button used for front panel button
#define LED_PIN 12     // Define the pin connected to the WS2812 LED strip.
#define NUM_LEDS 1     // Define the number of LEDs in the strip.
#define HAPPYCAB_TX 2 // Define the pin to communicate with the cabinet MCU (if used)
#define HAPPYCAB_RX 4 // Define the pin to communicate with the cabinet MCU (if used)
#define LONG_PRESS_TIME 1 // Define long press time (sec) for long press action on button
#define EXTRA_PRESS_TIME 3 // Define long press time (sec) for long press action on button

CRGB leds[NUM_LEDS];  // Create an array of CRGB colors for the LEDs.
#ifdef RFID_I2C
Adafruit_PN532 nfc(21, 22);
#else
MFRC522 mfrc522(SS_PIN, RST_PIN);  // Create an MFRC522 instance.
#endif

#ifdef DISPLAY_I2C_128x32
U8G2_SSD1306_128X32_UNIVISION_F_HW_I2C u8g2(U8G2_R0);
#else
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0);
#endif
#ifdef REMOTE_ACCESS
WebServer server(80);
#endif
#ifdef HAPPYCAB_ENABLE
HardwareSerial cardReaderSerial(2);
#endif
TaskHandle_t Task1;
TaskHandle_t Task2;
TaskHandle_t Task3;
TaskHandle_t Task4;

int enableState = 0;
int blockState = 0;
int blockOverride = 0;
int displayState = -1;
bool waitingForUnblock = false;
bool lastButtonState = false;
bool handledButtonState = false;
unsigned long buttonPressStartTime = 0;
int mcuState = -1;
int displayTimeout = 0;
int previousDisplayTimeout = 0;
int typeOfMessage = -1;
int messageIcon = 0;
String messageText = "";
bool isJpnMessage = false;
int brightMessage = 1;
bool invertMessage = false;

int lastCheckIn = 0;

char* sys_name = "";
bool sys_jpn = false;
bool sys_free_play = false;
bool sys_currency_mode = false;
bool sys_button_remote_action = false;
float sys_currency_rate = 1;
float sys_cost = 1;
bool sys_callbackOnBlockedTap = false;

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(21, OUTPUT);
  pinMode(22, OUTPUT);
  pinMode(BLOCK_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  digitalWrite(RELAY_PIN, LOW);                           // Initially, set the relay to OFF.
  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);  // Initialize the LED strip.
  u8g2.begin();
  u8g2.enableUTF8Print();
  setLEDs(CRGB::Black);
  FastLED.setBrightness(255);
  FastLED.clear();
  FastLED.show();
  bootScreen("HARDWARE");
  #ifdef RFID_I2C
    Wire.begin(21, 22);
    nfc.begin();
    uint32_t versiondata = nfc.getFirmwareVersion();
    if (!versiondata) {
      Serial.println("Didn't find PN53x board");
      bootScreen("NFC FAILURE");
      while (1)
        ;
    }
    Serial.print("Found chip PN5");
    Serial.println((versiondata >> 24) & 0xFF, HEX);
    Serial.print("Firmware ver. ");
    Serial.print((versiondata >> 16) & 0xFF, DEC);
    Serial.print('.');
    Serial.println((versiondata >> 8) & 0xFF, DEC);
    nfc.setPassiveActivationRetries(0x0A);
    nfc.SAMConfig();
  #else
    SPI.begin();         // Initialize SPI communication.
    mfrc522.PCD_Init();  // Initialize the RFID module.
    mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_48dB);
  #endif
  checkWiFiConnection();

  #ifdef REMOTE_ACCESS
    server.on("/test/block", [=]() {
      if (blockOverride == 0) {
        blockOverride = 1;
      } else {
        blockOverride = 0;
      }
      enableState = 1;
      Serial.print("Set coin blocker overide: ");
      Serial.println((blockOverride == 1) ? "Overided" : "Normal");
      server.send(200, "text/plain", (blockOverride == 1) ? "Overided Coin Enable" : "Normal Mode");
    });
    server.on("/enable", [=]() {
      enableState = 1;
      server.send(200, "text/plain", "OK");
    });
    server.on("/disable", [=]() {
      enableState = 0;
      server.send(200, "text/plain", "OK");
    });
    server.on("/status", [=]() {
      String assembledOutput = "";
      assembledOutput += ((enableState == 0) ? "Disabled" : ((blockState == 1) ? "Blocked" : "Enabled"));
      server.send(200, "text/plain", assembledOutput);
    });
    server.on("/credit", [=]() {
      String assembledOutput = "";
      handleDispenseCoin();
      server.send(200, "text/plain", "OK");
    });
    server.on("/reboot", [=]() {
      String assembledOutput = "";
      server.send(200, "text/plain", "OK");
      ESP.restart();
    });
    server.begin();
    Serial.println("Remote Access Enabled");
  #endif

  #ifdef HAPPYCAB_ENABLE
    bootScreen("CR_LINK");
    cardReaderSerial.begin(9600, SERIAL_8N1, 16, 17);
    if (!cardReaderSerial) {
      bootScreen("CARDREADER_FAIL_1");
      Serial.println("Serial Port did no load!");
      while (1) { // Don't continue with invalid configuration
        delay (1000);
      }
    } else {
      cardReaderSerial.println("HELLO::NO_DATA_ED_");
    }
    delay (500);
    enableState = 0;
  #else
    enableState = 1;
  #endif
  Serial.println("Reader is ready to init");
  #ifdef MULTICORE_ENABLE
    bootScreen("BOOT_HCCL");
    //create a task that will be executed in the Task2code() function, with priority 1 and executed on core 1
    xTaskCreatePinnedToCore(
                      cardReaderTXLoop,   /* Task function. */
                      "mcuTX",     /* name of task. */
                      10000,       /* Stack size of task */
                      NULL,        /* parameter of the task */
                      1,           /* priority of the task */
                      &Task3,      /* Task handle to keep track of created task */
                      1);          /* pin task to core 1 */
    delay(500);
    //create a task that will be executed in the Task2code() function, with priority 1 and executed on core 1
    xTaskCreatePinnedToCore(
                      cardReaderRXLoop,   /* Task function. */
                      "mcuRX",     /* name of task. */
                      10000,       /* Stack size of task */
                      NULL,        /* parameter of the task */
                      1,           /* priority of the task */
                      &Task4,      /* Task handle to keep track of created task */
                      1);          /* pin task to core 1 */
    delay(500);
    bootScreen("BOOT_CPU1");
    xTaskCreatePinnedToCore(
                      cpu2Loop,   /* Task function. */
                      "Watchdog",     /* name of task. */
                      10000,       /* Stack size of task */
                      NULL,        /* parameter of the task */
                      1,           /* priority of the task */
                      &Task1,      /* Task handle to keep track of created task */
                      0);          /* pin task to core 0 */
    delay(250);
    bootScreen("BOOT_CPU2");
    delay(250);
    //create a task that will be executed in the Task2code() function, with priority 1 and executed on core 1
    xTaskCreatePinnedToCore(
                      cpu1Loop,   /* Task function. */
                      "ReaderTask",     /* name of task. */
                      10000,       /* Stack size of task */
                      NULL,        /* parameter of the task */
                      1,           /* priority of the task */
                      &Task2,      /* Task handle to keep track of created task */
                      1);          /* pin task to core 1 */
    delay(500);
  #endif
}
void loop() {
  #ifdef MULTICORE_ENABLE
    // Handled by tasks
  #else
    int time_in_sec = esp_timer_get_time() / 1000000;
    if (time_in_sec >= 86400) {
      Serial.println("Daily Reboot");
      ESP.restart();
    } else if (lastCheckIn <= time_in_sec - 18000) {
      Serial.println("Check in");
      getConfig(false);
    }
    checkWiFiConnection();
    #ifdef REMOTE_ACCESS
      server.handleClient();
    #endif
    runtime();
  #endif
}

//////////////////////
// System Functions //
//////////////////////

// Check WiFi or Connect
void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    setLEDs(CRGB::Magenta);
    bootScreen("NETWORK");
    Serial.println("WiFi not connected. Attempting to reconnect...");
    WiFi.hostname("SimpleCard");
    WiFi.disconnect(true);
    WiFi.begin(ssid, password);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
    int tryCount = 0;
    while (WiFi.status() != WL_CONNECTED) {
      if (digitalRead(BUTTON_PIN) == LOW) {
        ESP.restart();
      }
      if (tryCount > 10) {
        ESP.restart();
      }
      delay(1000);
      Serial.print(".");
      tryCount++;
    }
    Serial.println("\nConnected to WiFi");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("MAC address: ");
    Serial.println(WiFi.macAddress());
    bootScreen("CONFIG");
    getConfig(true);
    bootScreen("READY");
    delay(250);
  }
}
// Get Reader Config
void getConfig(bool firstStart) {
  Serial.println("Refreshing system config....");
  HTTPClient http;
  String url = String(apiUrl) + "get/machine/" + WiFi.macAddress() + ((firstStart == true) ? "/init" : "/checkin") + "?key=" + deviceKey;
  Serial.println("Sending GET request to: " + url);
  http.begin(url);
  int httpCode = http.GET();
  String httpResponse = http.getString();
  http.end();
  Serial.println("HTTP Response code: " + String(httpCode));
  if (httpCode == 200) {
    Serial.println(httpResponse);
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, httpResponse);
    //sys_name = doc["name"];
    sys_cost = doc["cost"];
    sys_free_play = doc["free_play"];
    sys_currency_mode = doc["currency_mode"];
    sys_currency_rate = (sys_currency_mode == true) ? doc["currency_rate"] : 0;
    sys_jpn = doc["japanese"];
    sys_button_remote_action = doc["button_callback"];
    sys_callbackOnBlockedTap = doc["has_blocked_callback"];
    lastCheckIn = esp_timer_get_time() / 1000000;
  } else if (httpCode >= 400 && httpCode <= 499) {
    while(true) {
      if (firstStart == true) {
        bootScreen("AUTH FAIL");
        delay(5000);
        bootScreen(WiFi.macAddress());
        delay(60000);
        ESP.restart();
      } else {
        ESP.restart();
      }
    };
  } else {
    Serial.println("Can't get config");
    if (firstStart == true) {
      bootScreen("AUTH FAIL");
      delay(5000);
      ESP.restart();
    }
  }
}
// Gets Cards UID
String getUID() {
  String uid = "";
  #ifdef RFID_I2C
    uint8_t success;
    uint8_t uidValue[] = { 0, 0, 0, 0, 0, 0, 0 };
    uint8_t uidLength;
    success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uidValue, &uidLength);
    if (success) {
      for (uint8_t i = 0; i < uidLength; i++) {
        uid += String(uidValue[i], HEX);
      }
      uid.toUpperCase();
    }
  #else
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      uid += String(mfrc522.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
  #endif
  return uid;
}


//////////////////////
// Action Handelers //
//////////////////////

// Primary Loop function
#ifdef MULTICORE_ENABLE
void cpu1Loop( void * pvParameters ) {
  Serial.print("Primary Task running on core ");
  Serial.println(xPortGetCoreID());

  for(;;) {
    runtime();
  }
}
// Secoundary Loop Function
void cpu2Loop( void * pvParameters ) {
  Serial.print("Secoundary Task running on core ");
  Serial.println(xPortGetCoreID());

  for(;;) {
    int time_in_sec = esp_timer_get_time() / 1000000;
    int currentMillis = millis();
    if (time_in_sec >= 86400) {
      Serial.println("Daily Reboot");
      ESP.restart();
    } else if (lastCheckIn <= time_in_sec - 18000) {
      Serial.println("Check in");
      getConfig(false);
    }
    checkWiFiConnection();
    #ifdef BEEPER_ENABLE
    if (startMelody == true) {
      if (currentMillis - previousMelodyMillis >= pauseBetweenNotes) {
        previousMelodyMillis = currentMillis;
        if (melodyPlay == 0) {
          playMelody(credit_tone, credit_tone_dur, sizeof(credit_tone_dur) / sizeof(int));
        } else if (melodyPlay == 1) {
          playMelody(blocked_tone, blocked_tone_dur, sizeof(credit_tone_dur) / sizeof(int));
        }
      }
    }
    #endif
    #ifdef REMOTE_ACCESS
      server.handleClient();
    #endif
  }
}
int last_card_response = -1;
String last_card_data = "";
bool send_boot = false;
bool send_button_0 = false;
bool send_button_1 = false;
bool send_button_2 = false;
bool send_button_3 = false;
bool send_button_4 = false;
bool send_button_5 = false;
#ifdef HAPPYCAB_ENABLE
// MCU Talk Loop Function
void cardReaderTXLoop( void * pvParameters ) {
  for(;;) {
    cardReaderSerial.println("COIN_ENABLE::" + String((digitalRead(BLOCK_PIN) == LOW || blockOverride == 1) ? "1" : "0") + "::");
    delay(100);
    if (last_card_response != -1) {
      // Send Credit If Needed
      if (blockOverride == 1 && (last_card_response >= 200 && last_card_response < 300)) {
        for (int i = 0; i < 2; i++) {
          cardReaderSerial.println("GPIO::CREDIT::");
          delay(100);
        }
      }
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("COIN_DISPENSE::" + String(last_card_response) +  "::" + last_card_data + "::");
        delay(100);
      }
      last_card_response = -1;
      last_card_data = "";
    } else if (send_boot == true) {
      // Send Boot Command
      send_boot = false;
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("BOOT_REQUEST::NO_DATA::");
        delay(100);
      }
    } else if (send_button_0 == true) {
      // Send Boot Command
      send_button_0 = false;
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("BUTTON_REQUEST::0::");
        delay(100);
      }
    } else if (send_button_1 == true) {
      // Send Boot Command
      send_button_1 = false;
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("BUTTON_REQUEST::1::");
        delay(100);
      }
    } else if (send_button_2 == true) {
      // Send Boot Command
      send_button_2 = false;
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("BUTTON_REQUEST::2::");
        delay(100);
      }
    } else if (send_button_3 == true) {
      // Send Boot Command
      send_button_3 = false;
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("BUTTON_REQUEST::3::");
        delay(100);
      }
    } else if (send_button_4 == true) {
      // Send Boot Command
      send_button_4 = false;
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("BUTTON_REQUEST::4::");
        delay(100);
      }
    } else if (send_button_5 == true) {
      // Send Boot Command
      send_button_5 = false;
      for (int i = 0; i < 2; i++) {
        cardReaderSerial.println("BUTTON_REQUEST::5::");
        delay(100);
      }
    }
  }
}
void cardReaderRXLoop( void * pvParameters ) {
  for(;;) {
    if (cardReaderSerial.available()) {
      static String receivedMessage = "";
      char c;
      bool messageStarted = false;

      while (cardReaderSerial.available()) {
        c = cardReaderSerial.read();
        Serial.print(c);
        if (c == '\n') {
          if (!receivedMessage.isEmpty()) {
            handleCRMessage(receivedMessage);
            //Serial.println("Received: " + receivedMessage);
          }
          receivedMessage = "";
        } else {
          receivedMessage += c;
        }

      }
    } else {
      delay(1);
    }
  }
}

#endif
#endif
// Primary Loop Function
void runtime() {
  if (displayTimeout != 0) {
    unsigned long currentMillis = millis();
    if (millis() - previousDisplayTimeout >= displayTimeout) {
      displayTimeout = 0;
      typeOfMessage = -1;
      messageIcon = 0;
      messageText = "";
      isJpnMessage = false;
      brightMessage = 1;
      invertMessage = false;
    } else if (displayState != -2) {
        if (typeOfMessage == 1) {
          displayCustomMessage(messageIcon, messageText, isJpnMessage, brightMessage, invertMessage);
        } else if (typeOfMessage == 0) {
          displayCustomMessageSingleLine(messageIcon, messageText, isJpnMessage, brightMessage, invertMessage);
        }
    }
  }
  if (digitalRead(BLOCK_PIN) == LOW || blockOverride == 1) {
      // Game Enabled
      if (blockState == 1) {
        // Was Previouly Blocked
        handleUnblocking();
      }
      if (enableState == 0) {
        // Disabled by Admin
        displayDisableReader();
      } else {
        // Enabled by Admin
        if (digitalRead(BUTTON_PIN) == LOW) {
          // Button is being pressed
          if (lastButtonState == false) {
            lastButtonState = true;
            handledButtonState = false;
            buttonPressStartTime = millis();
            #ifdef HAPPYCAB_ENABLE
            //
            #else
              displayButtonDisplayEnabled();
            #endif
          } else if (lastButtonState == true && handledButtonState == false && millis() - buttonPressStartTime >= (EXTRA_PRESS_TIME * 1000)) {
            // Extra Long press detected
            send_button_5 = true;
            handledButtonState = true;
          } 
        } else if (digitalRead(BUTTON_PIN) == HIGH && handledButtonState == true) {
          // Button was released and already handled
          lastButtonState = false;
          handledButtonState = false;
        } else if (digitalRead(BUTTON_PIN) == HIGH && lastButtonState == true) {
          // Button was released
          lastButtonState = false;
          #ifdef HAPPYCAB_ENABLE
            if (millis() - buttonPressStartTime >= (LONG_PRESS_TIME * 1000)) {
              // Long press detected
              send_button_3 = true;
            } else {
              // Short press detected
              send_button_1 = true;
            }
          #endif
        } else {
          // Normal State
          handleCardRead();
          displayStandbyScreen();
        }
      }
    } else if (waitingForUnblock == true) {
      // Waiting for game to enable reader
      displayBootUpReader();
    } else if (digitalRead(BLOCK_PIN) == HIGH) {
      // Game Disabled
      if (blockState == 0) {
        // Was Previouly Unblocked
        handleBlocked();
      }
      if (enableState == 0) {
        // Disabled by Admin
        sleepDevice();
      } else {
        // Enabled by Admin
        if (digitalRead(BUTTON_PIN) == LOW) {
          // Button is being pressed
          if (lastButtonState == false) {
            lastButtonState = true;
            buttonPressStartTime = millis();
            #ifdef HAPPYCAB_ENABLE
            //
            #else
              displayButtonDisplayDisabled();
            #endif
          } else if (lastButtonState == true && handledButtonState == false && millis() - buttonPressStartTime >= (EXTRA_PRESS_TIME * 1000)) {
            // Extra Long press detected
            send_button_4 = true;
            handledButtonState = true;
          } 
        } else if (digitalRead(BUTTON_PIN) == HIGH && handledButtonState == true) {
          // Button was released and already handled
          lastButtonState = false;
          handledButtonState = false;
        } else if (digitalRead(BUTTON_PIN) == HIGH && lastButtonState == true) {
          // Button was released
          lastButtonState = false;
          #ifdef HAPPYCAB_ENABLE
            if (millis() - buttonPressStartTime >= (LONG_PRESS_TIME * 1000)) {
              // Long press detected
              send_button_2 = true;
            } else {
              // Short press detected
              send_button_0 = true;
            }
          #endif
        } else if (sys_callbackOnBlockedTap == true) {
          // Normal State (With Waiting Card)
          handleCardRead();
          displayEcoModeScreen();
        } else {
          // Normal State
          sleepDevice();
        }
      }
    }
}
// Handle Card Scanner
void handleCardRead() {
  #ifdef RFID_I2C
  String uid = getUID();
  if (uid != "") {
  #else
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
  #endif
    if (blockState == 1) {
      if (sys_callbackOnBlockedTap == true) {
      #ifdef RFID_I2C
          // UID has already been loaded
        #else
          // A new card is detected, read its UID.
          String uid = getUID();
        #endif
        handleBlockedCallback(uid);
      }
    } else {
      #ifdef RFID_I2C
        // UID has already been loaded
      #else
        // A new card is detected, read its UID.
        String uid = getUID();
      #endif
      Serial.print("Card Detected: ");
      Serial.println(uid);
      displayStartComm(uid);

      HTTPClient http;
      String url = String(apiUrl) + "withdraw/" + WiFi.macAddress() + "/" + uid + "?key=" + deviceKey;
      Serial.println("Sending GET request to: " + url);
      http.begin(url);
      int httpCode = http.GET();
      String httpResponse = http.getString();
      http.end();
      Serial.println("HTTP Response code: " + String(httpCode));

      last_card_response = httpCode;
      last_card_data = httpResponse;

      if (httpCode >= 200 && httpCode < 300) {
        // Withdraw Approved
        Serial.println("Card OK, Dispense Credit");
        handleDispenseCoin();
        displayCreditReponse(httpCode, httpResponse);
      } else if (httpCode == 400) {
        // Withdraw Declined
        Serial.println("Card OK, No Avalible Balance! " + uid);
        displayCreditReponse(httpCode, httpResponse);
      } else if (httpCode == 404) {
        // Invalid Card
        Serial.println("Card Denied! " + uid);
        displayInvalidCard();
      } else if (httpCode > 400) {
        // Account Issue
        Serial.println("Card OK, Account Issue! " + uid);
        displayAccountIssue(httpCode, httpResponse);
      } else {
        // Invalid Card
        Serial.println("Communication Error: " + uid);
        displayCommunicationError();
      }
    }
  } else {
    #ifdef RFID_I2C
      delay(1000);
    #endif
  }
}
// Handle Blocked Callback Tap - Needs Card UID
void handleBlockedCallback(String uid) {
  if (uid != "") {
    Serial.println("Card " + uid + " was tapped in blocked state");
    HTTPClient http;
    #ifdef HAPPYCAB_ENABLE
      String url = String(apiUrl) + "blocked_callback/" + WiFi.macAddress() + "/" + uid + "?request_only=true&key=" + deviceKey;
    #else
      String url = String(apiUrl) + "blocked_callback/" + WiFi.macAddress() + "/" + uid + "?key=" + deviceKey;
    #endif
    Serial.println("Sending GET request to: " + url);
    http.begin(url);
    int httpCode = http.GET();
    http.end();
    Serial.println("HTTP Response code: " + String(httpCode));
    if (httpCode == 200) {
      #ifdef HAPPYCAB_ENABLE
        send_boot = true;
      #endif
      displayBootUpReader();
      waitingForUnblock = true;
      Serial.println("Reader is in holding pattern until game unblocks...");
      delay(15000);
    } else {
      Serial.println("Unauthorized Card");
      delay(1000);
    }
  }
}

////////////////////////////////
// Hardware Actions Handelers //
////////////////////////////////

// Handles Game Disable Signal
void handleBlocked() {
  blockState = 1;
  Serial.println("Game has disabled card reader!");
}
// Handles Game Enable Signal
void handleUnblocking() {
  waitingForUnblock = false;
  blockState = 0;
  enableState = 1;
  Serial.println("Game has enabled card reader!");
}
// Handles Dispenseing Credit
void handleDispenseCoin() {
  digitalWrite(RELAY_PIN, HIGH);
  delay(100);
  digitalWrite(RELAY_PIN, LOW);
}
#ifdef HAPPYCAB_ENABLE

bool ignore_next_state = false;
void handleCRMessage(String inputString) {
  int delimiterIndex = inputString.indexOf("::");
  if (delimiterIndex != -1) {
    int headerIndex = inputString.indexOf("::");
    String header = inputString.substring(0, headerIndex);
    if (header == "POWER_SWITCH") {
      ignore_next_state = false;
      int valueIndex = inputString.indexOf("::", headerIndex + 2);
      String valueString = inputString.substring(headerIndex + 2, valueIndex);
      int mcuState = valueString.toInt();
      switch (mcuState) {
        case 0:
          enableState = 0;
          waitingForUnblock == false;
          break;
        case 1:
          enableState = 1;
          waitingForUnblock == false;
          break;
        case 2:
          enableState = 1;
          if (digitalRead(BLOCK_PIN) == HIGH) {
            waitingForUnblock == true;
          }
          break;
        default:
          break;
      }
    } else if (header == "DISPLAY_MESSAGE") {
      int typeIndex = inputString.indexOf("::", headerIndex + 2);
      String typeString = inputString.substring(headerIndex + 2, typeIndex);

      int iconIndex = inputString.indexOf("::", typeIndex + 2);
      String iconString = inputString.substring(typeIndex + 2, iconIndex);
      messageIcon = iconString.toInt();
      int textIndex = inputString.indexOf("::", iconIndex + 2);
      messageText = inputString.substring(iconIndex + 2, textIndex);
      int isJpIndex = inputString.indexOf("::", textIndex + 2);
      String isJpString = inputString.substring(textIndex + 2, isJpIndex);
      isJpnMessage = (isJpString == "t");
      int brightIndex = inputString.indexOf("::", isJpIndex + 2);
      String brightString = inputString.substring(isJpIndex + 2, brightIndex);
      brightMessage = brightString.toInt();
      int invertIndex = inputString.indexOf("::", brightIndex + 2);
      String invertString = inputString.substring(brightIndex + 2, invertIndex);
      invertMessage = (invertString == "t");
      int timeoutIndex = inputString.indexOf("::", invertIndex + 2);
      String timeoutString = inputString.substring(invertIndex + 2, timeoutIndex);
      int timeout = timeoutString.toInt() * 1000;

      if (messageIcon != -1 && messageText.isEmpty() == false && brightMessage != -1 && brightMessage >= 1 && brightMessage <= 255) {
        if (typeString == "BIG") {
          typeOfMessage = 1;
        } else if (typeString == "SMALL") {
          typeOfMessage = 0;
        }
        displayState = -1;
        displayTimeout = (timeout > 0) ? timeout : 10000;
        previousDisplayTimeout = millis();
      } else {
        displayState = -1;
        displayTimeout = 0;
        typeOfMessage = -1;
        messageIcon = 0;
        messageText = "";
        isJpnMessage = false;
        brightMessage = 1;
        invertMessage = false;
      }
    } else if (header == "BLOCKER_OPEN") {
      blockOverride = 1;
    } else if (header == "BLOCKER_CLOSE") {
      blockOverride = 0;
    } else if (header == "REBOOT") {
      bootScreen("UPSTREAM_MCU_RST");
      delay(500);
      ESP.restart();
    }
  }
}
#endif

///////////////////////////////
// Display and LED Functions //
///////////////////////////////

// Display Custom Message and Icon - DS Interupt
void displayCustomMessage(int icon, String text, bool is_jpn, int brightness, bool invert) {
  displayState = -2;
  u8g2.setPowerSave(0);
  u8g2.setContrast(brightness);
  u8g2.clearBuffer();
  if (invert == true) {
    u8g2.setDrawColor(1);
    u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
    u8g2.sendBuffer();
    u8g2.setDrawColor(0);
    u8g2.setColorIndex(0);
  }
  const char* string = text.c_str();
  #ifdef DISPLAY_I2C_128x32
      u8g2.setFont((is_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2);
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawUTF8(centerX, centerY, string);
  #else
      u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
      int centerGlX = (u8g2.getWidth() - 32) / 2;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
      u8g2.drawGlyph(centerGlX, centerGlY, icon);
      u8g2.setFont((is_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      u8g2.drawUTF8(centerX, 55, string);
  #endif
  u8g2.setDrawColor(1);
  u8g2.sendBuffer();
}
void displayCustomMessageSingleLine(int icon, String text, bool is_jpn, int brightness, bool invert) {
  displayState = -2;
  u8g2.setPowerSave(0);
  u8g2.setContrast(brightness);
  u8g2.clearBuffer();
  if (invert == true) {
    u8g2.setDrawColor(1);
    u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
    u8g2.sendBuffer();
    u8g2.setDrawColor(0);
    u8g2.setColorIndex(0);
  }
  const char* string = text.c_str();
  u8g2.setFont((is_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
  int textWidth = u8g2.getUTF8Width(string);
  int centerX = ((u8g2.getWidth() - textWidth) / 2) + (28 / 2);
  int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - (28 / 2);
  int centerY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
  u8g2.drawUTF8(centerX, centerY, string);
  u8g2.setFont(u8g2_font_streamline_interface_essential_other_t);
  int centerGlY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
  u8g2.drawGlyph(centerGlX, centerGlY, icon);
  u8g2.setDrawColor(1);
  u8g2.sendBuffer();
}
// Display Standby Screen (Game Enabled) - DS 10
void displayStandbyScreen() {
  if (displayTimeout == 0 && displayState != 10) {
    u8g2.setPowerSave(0);
    u8g2.setContrast(1);
    u8g2.clearBuffer();
    const char* string = (sys_jpn == true) ? "カードをタップします!" : "Tap your card!";
    #ifdef DISPLAY_I2C_128x32
        u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
        int textWidth = u8g2.getUTF8Width(string);
        int centerX = ((u8g2.getWidth() - textWidth) / 2) + 14;
        int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
        u8g2.drawUTF8(centerX, centerY, string);
        u8g2.setFont(u8g2_font_streamline_all_t);
        int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - 14;
        int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
        u8g2.drawGlyph(centerGlX, centerGlY, 77);
    #else
        u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
        int centerGlX = (u8g2.getWidth() - 32) / 2;
        int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
        u8g2.drawGlyph(centerGlX, centerGlY, 139);
        u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
        int textWidth = u8g2.getUTF8Width(string);
        int centerX = (u8g2.getWidth() - textWidth) / 2;
        u8g2.drawUTF8(centerX, (sys_jpn == true) ? 54 : 55, string);
    #endif
    u8g2.sendBuffer();
    displayState = 10;
  }
  setLEDs(CRGB::Yellow);
}
// Display Standby Screen (Game Enabled) - DS 15
void displayEcoModeScreen() {
  if (displayTimeout == 0 && displayState != 15) {
    u8g2.setPowerSave(0);
    u8g2.setContrast(1);
    u8g2.clearBuffer();

    const char* string = (sys_jpn == true) ? "マシンが使用不可" : "Unavailable";
    #ifdef DISPLAY_I2C_128x32
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2) + 14;
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawUTF8(centerX, centerY, string);
      u8g2.setFont(u8g2_font_streamline_all_t);
      int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - 14;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawGlyph(centerGlX, centerGlY, 328);
    #else
      u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
      int centerGlX = (u8g2.getWidth() - 32) / 2;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
      u8g2.drawGlyph(centerGlX, centerGlY, 87);
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      u8g2.drawUTF8(centerX, 55, string);
    #endif
    u8g2.setDrawColor(1);

    u8g2.sendBuffer();
    displayState = 15;
  }
  setLEDs(CRGB::Black);
}
// Display Communication Started - DS Interupt
void displayStartComm(String uid) {
  if (displayTimeout == 0) {
    displayState = -1;
    u8g2.setPowerSave(0);
    u8g2.setContrast(1);
    u8g2.clearBuffer();
    const char* string = (sys_jpn == true) ? "接続中" : "Communicating";
    #ifdef DISPLAY_I2C_128x32
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2) + 14;
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawUTF8(centerX, centerY, string);
      u8g2.setFont(u8g2_font_streamline_all_t);
      int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - 14;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawGlyph(centerGlX, centerGlY, 510);
    #else
      u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
      int centerGlX = (u8g2.getWidth() - 32) / 2;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
      u8g2.drawGlyph(centerGlX, centerGlY, 84);
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      u8g2.drawUTF8(centerX, 55, string);
    #endif
    u8g2.sendBuffer();
  }
  setLEDs(CRGB::Black);
}
// Display Credit Response - DS Interupt
void displayCreditReponse(int httpCode, String message) {
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, message);
  const float cost = doc["cost"];
  const float balance = doc["balance"];
  const bool free_play = doc["free_play"];
  const int time_left = doc["time_left"];
  const bool currency_mode = doc["currency_mode"];
  const float currency_rate = (currency_mode) ? doc["currency_rate"] : 0;
  const bool jpn = doc["japanese"];
  if (displayTimeout == 0) {
    displayState = -1;
    u8g2.setPowerSave(0);
    u8g2.setContrast(255);
    Serial.println(message);
    u8g2.clearBuffer();

    // Low Balanace or No Balance
    if ((httpCode != 200 && free_play == false) || (free_play == true && time_left != -1 && time_left <= 1800000)) {
      u8g2.setDrawColor(1);
      u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
      u8g2.sendBuffer();
      u8g2.setDrawColor(0);
      u8g2.setColorIndex(0);
      setLEDs(CRGB::Orange);
    } else {
      setLEDs(CRGB::Cyan);
    }

    // Display Balance
    float true_balance = balance;
    if (free_play == true) {
      // Free Play
      const char* string = "FREEPLAY";
      u8g2.setFont(u8g2_font_logisoso20_tr);  // Choose your font
      int textWidth = u8g2.getStrWidth(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      #ifdef DISPLAY_I2C_128x32
          int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      #else
          int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      #endif
      u8g2.drawStr(centerX, centerY, string);
    } else if (currency_mode == true) {
      // Currency Mode
      true_balance = balance * currency_rate;
      int disBalance = round(true_balance);
      char string[10];
      sprintf(string, "%d", disBalance);
      u8g2.setFont((strlen(string) > 4) ? u8g2_font_logisoso16_tr : u8g2_font_logisoso32_tr);  // Choose your font
      int textWidth = u8g2.getStrWidth(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2) + (((strlen(string) > 4) ? 16 : 32) / 2);
      int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - (((strlen(string) > 4) ? 16 : 32) / 2);
      #ifdef DISPLAY_I2C_128x32
          int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      #else
          int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      #endif
          u8g2.drawStr(centerX, centerY, string);
      #ifdef DISPLAY_I2C_128x32
          u8g2.setFont((strlen(string) > 4) ? u8g2_font_open_iconic_all_2x_t : u8g2_font_open_iconic_all_4x_t);
          int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      #else
          u8g2.setFont((strlen(string) > 4) ? u8g2_font_open_iconic_all_2x_t : u8g2_font_open_iconic_all_4x_t);
          int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      #endif
      u8g2.drawGlyph(centerGlX, centerGlY, (jpn == true) ? 284 : 147);
    } else {
      // Credit Mode
      int disBalance = round(true_balance);
      char string[10];
      sprintf(string, "%d", disBalance);
      u8g2.setFont(u8g2_font_logisoso32_tr);  // Choose your font
      int textWidth = u8g2.getStrWidth(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      #ifdef DISPLAY_I2C_128x32
          int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      #else
          int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      #endif
      u8g2.drawStr(centerX, centerY, string);
    }

    // Add Reason - Low Balance or No Balance
    if (httpCode != 200 && free_play == false) {
      #ifdef DISPLAY_I2C_128x32
          // Nothing
      #else
          String lowbal = (httpCode == 400) ? ((sys_jpn == true) ? "お金が足りない" : "Balance to low!") : ((sys_jpn == true) ? "カード残高が少ない" : "Low Balance!");
          u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
          int messageWidth = u8g2.getUTF8Width(lowbal.c_str());
          int centerMsgX = (u8g2.getWidth() - messageWidth) / 2;
          u8g2.drawUTF8(centerMsgX, 60, lowbal.c_str());
      #endif
    } else if (free_play == true && time_left != -1 && time_left <= 1800000) {
      #ifdef DISPLAY_I2C_128x32
          // Nothing
      #else
          unsigned long time_left_ms = time_left % 60000;  // Get remaining milliseconds
          unsigned int minutes = (time_left - time_left_ms) / 60000;  // Convert to minutes
          char time_str[20];
          if (sys_jpn == true) {
            sprintf(time_str, "残り%d分!", minutes);
          } else {
            sprintf(time_str, "%d Minutes Left!", minutes);
          }
          u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
          int messageWidth = u8g2.getUTF8Width(time_str);
          int centerMsgX = (u8g2.getWidth() - messageWidth) / 2;
          u8g2.drawUTF8(centerMsgX, 60, time_str);
      #endif
    }

    u8g2.setDrawColor(1);
    u8g2.sendBuffer();

    if ((httpCode != 200 && free_play == false) || (free_play == true && time_left != -1 && time_left <= 1800000)) {
      // Flash Low Balance or No Balance
      int count = 3;
      delay(250);
      while (count > 0) {
        setLEDs(CRGB::Orange);
        u8g2.setContrast(1);
        delay(500);
        setLEDs((httpCode == 400) ? CRGB::Red : CRGB::Cyan);
        u8g2.setContrast(255);
        delay(500);
        count = count - 1;
      }
    } else {
      // Delay for next read
      delay(500);
      setLEDs(0x808080);
      delay(2500);
    }
  } else {
    if ((httpCode != 200 && free_play == false) || (free_play == true && time_left != -1 && time_left <= 1800000)) {
      setLEDs(CRGB::Orange);
    } else {
      setLEDs(CRGB::Cyan);
    }
    if ((httpCode != 200 && free_play == false) || (free_play == true && time_left != -1 && time_left <= 1800000)) {
        // Flash Low Balance or No Balance
        int count = 3;
        delay(250);
        while (count > 0) {
          setLEDs(CRGB::Orange);
          delay(500);
          setLEDs((httpCode == 400) ? CRGB::Red : CRGB::Cyan);
          delay(500);
          count = count - 1;
        }
      } else {
        // Delay for next read
        delay(500);
        setLEDs(0x808080);
        delay(2500);
      }
    delay(3000);
  }
}
// Display Invalid Card - DS Interupt
void displayInvalidCard() {
  if (displayTimeout == 0) {
    displayState = -1;
    setLEDs(CRGB::Red);
    u8g2.setPowerSave(0);
    u8g2.setContrast(255);
    u8g2.clearBuffer();
    u8g2.setDrawColor(1);
    u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
    u8g2.sendBuffer();
    u8g2.setDrawColor(0);
    u8g2.setColorIndex(0);
    const char* string = (sys_jpn == true) ? "無効なカード" : "Invalid Card";
    #ifdef DISPLAY_I2C_128x32
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2) + 14;
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawUTF8(centerX, centerY, string);
      u8g2.setFont(u8g2_font_streamline_all_t);
      int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - 14;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawGlyph(centerGlX, centerGlY, 328);
    #else
      u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
      int centerGlX = (u8g2.getWidth() - 32) / 2;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
      u8g2.drawGlyph(centerGlX, centerGlY, 121);
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      u8g2.drawUTF8(centerX, 55, string);
    #endif
    u8g2.setDrawColor(1);
    u8g2.sendBuffer();
    int count = 3;
    delay(250);
    while (count > 0) {
      u8g2.setContrast(1);
      delay(500);
      u8g2.setContrast(255);
      delay(500);
      count = count - 1;
    }
  } else {
    setLEDs(CRGB::Red);
    delay(1250);
  }
}
// Display Account Issue Response - DS Interupt
void displayAccountIssue(int httpCode, String message) {
  if (displayTimeout == 0) {
    displayState = -1;
    setLEDs(CRGB::Red);
    u8g2.setPowerSave(0);
    u8g2.setContrast(255);
    u8g2.clearBuffer();
    u8g2.setDrawColor(1);
    u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
    u8g2.sendBuffer();
    u8g2.setDrawColor(0);
    u8g2.setColorIndex(0);
    const char* string = (httpCode == 407) ? ((sys_jpn == true) ? "減速する!" : "Slow down!") : ((sys_jpn == true) ? "アテンダントを参照" : "See Attendant");
    #ifdef DISPLAY_I2C_128x32
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2) + 14;
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawUTF8(centerX, centerY, string);
      u8g2.setFont(u8g2_font_streamline_all_t);
      int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - 14;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawGlyph(centerGlX, centerGlY, (httpCode == 407) ? 489 : 328);
    #else
      u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
      int centerGlX = (u8g2.getWidth() - 32) / 2;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
      u8g2.drawGlyph(centerGlX, centerGlY, (httpCode == 407) ? 123 : 121);
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      u8g2.drawUTF8(centerX, 55, string);
    #endif
    u8g2.setDrawColor(1);
    u8g2.sendBuffer();
    int count = 3;
    delay(250);
    while (count > 0) {
      u8g2.setContrast(1);
      delay(500);
      u8g2.setContrast(255);
      delay(500);
      count = count - 1;
    }
  } else {
    setLEDs(CRGB::Red);
    delay(1250);
  }
}
// Display Communication Error - DS Interupt (TODO)
void displayCommunicationError() {
  if (displayTimeout == 0) {
    displayState = -1;
    u8g2.setPowerSave(0);
    u8g2.setContrast(255);
    u8g2.clearBuffer();
    u8g2.setDrawColor(1);
    u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
    u8g2.sendBuffer();
    u8g2.setDrawColor(0);
    u8g2.setColorIndex(0);
    const char* string = (sys_jpn == true) ? "接続の問題" : "Comm Failure";
    #ifdef DISPLAY_I2C_128x32
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2) + 14;
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawUTF8(centerX, centerY, string);
      u8g2.setFont(u8g2_font_streamline_all_t);
      int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - 14;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
      u8g2.drawGlyph(centerGlX, centerGlY, 328);
    #else
      u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
      int centerGlX = (u8g2.getWidth() - 32) / 2;
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
      u8g2.drawGlyph(centerGlX, centerGlY, 121);
      u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
      int textWidth = u8g2.getUTF8Width(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      u8g2.drawUTF8(centerX, 55, string);
    #endif
    u8g2.setDrawColor(1);
    u8g2.sendBuffer();
  }
  setLEDs(CRGB::Black);
  delay(3000);
}
// Display Boot Messages - DS Interupt
void bootScreen(String input_message) {
  displayState = -1;
  u8g2.clearBuffer();
  #ifdef DISPLAY_I2C_128x32
  #else
    u8g2.setDrawColor(1);
  #endif
  u8g2.drawXBM(0, 0, bootLogo_w, bootLogo_h, bootLogo);
  u8g2.sendBuffer();
  #ifdef DISPLAY_I2C_128x32
    delay(1000);
    u8g2.clearBuffer();
  #endif
  u8g2.setDrawColor(0);
  u8g2.setColorIndex(0);
  u8g2.setFont(u8g2_font_HelvetiPixel_tr);  // Choose your font
  const char* string = input_message.c_str();
  int textWidth = u8g2.getStrWidth(string);
  int centerX = ((u8g2.getWidth() - textWidth) / 2);
  int centerGlX = ((u8g2.getWidth() - textWidth) / 2);
  #ifdef DISPLAY_I2C_128x32
    int centerY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
  #else
    int centerY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2 + 15;
  #endif
  u8g2.drawStr(centerX, centerY, string);
  u8g2.setDrawColor(1);
  u8g2.setColorIndex(1);
  u8g2.sendBuffer();
}
// Display "Game Over" on Reader Disable - DS 55
void displayDisableReader() {
  if (displayTimeout == 0 && displayState != 55) {
    u8g2.setPowerSave(0);
    u8g2.setContrast(1);
    u8g2.clearBuffer();
    u8g2.setDrawColor(1);
    u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
    u8g2.sendBuffer();
    u8g2.setDrawColor(0);
    u8g2.setColorIndex(0);
    u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
    const char* string = (sys_jpn == true) ? "ゲームオーバー" : "Game Over";
    int textWidth = u8g2.getUTF8Width(string);
    int centerX = ((u8g2.getWidth() - textWidth) / 2) + (28 / 2);
    int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - (28 / 2);
    int centerY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
    u8g2.drawUTF8(centerX, centerY, string);
    u8g2.setFont(u8g2_font_streamline_interface_essential_other_t);
    int centerGlY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
    u8g2.drawGlyph(centerGlX, centerGlY, 65);
    u8g2.setDrawColor(1);
    u8g2.sendBuffer();
    displayState = 55;
  }
  setLEDs(CRGB::Black);
}
// Display Blockd Callback "Wait a moment" - DS 50
void displayBootUpReader() {
  if (displayTimeout == 0 && displayState != 50) {
    u8g2.setPowerSave(0);
    u8g2.setContrast(1);
    u8g2.clearBuffer();
    const char* string = (sys_jpn == true) ? "ちょっと 待って..." : "Please Wait...";
    #ifdef DISPLAY_I2C_128x32
        u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
        int textWidth = u8g2.getUTF8Width(string);
        int centerX = ((u8g2.getWidth() - textWidth) / 2);
        int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
        u8g2.drawUTF8(centerX, centerY, string);
    #else
        u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
        int centerGlX = (u8g2.getWidth() - 32) / 2;
        int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
        u8g2.drawGlyph(centerGlX, centerGlY, 205);
        u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
        int textWidth = u8g2.getUTF8Width(string);
        int centerX = (u8g2.getWidth() - textWidth) / 2;
        u8g2.drawUTF8(centerX, 55, string);
    #endif
    u8g2.setDrawColor(1);
    u8g2.sendBuffer();
    displayState = 50;
  }
  setLEDs(CRGB::Black);
}
// Display Page 2 Display on Button Hold (Enabled) - DS 49
void displayButtonDisplayEnabled() {
  if (displayTimeout == 0 && displayState != 49) {
    u8g2.setPowerSave(0);
    u8g2.setContrast(1);
    u8g2.clearBuffer();

    if (sys_free_play == true) {
      const char* string = "FREEPLAY";
      u8g2.setFont(u8g2_font_logisoso20_tr);  // Choose your font
      int textWidth = u8g2.getStrWidth(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      u8g2.drawStr(centerX, centerY, string);
    } else if (sys_currency_mode == true) {
      int disCost = round(sys_cost * sys_currency_rate);
      char string[10];
      sprintf(string, "%d", disCost);
      u8g2.setFont((strlen(string) > 4) ? u8g2_font_logisoso16_tr : u8g2_font_logisoso32_tr);  // Choose your font
      int textWidth = u8g2.getStrWidth(string);
      int centerX = ((u8g2.getWidth() - textWidth) / 2) + (((strlen(string) > 4) ? 16 : 32) / 2);
      int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - (((strlen(string) > 4) ? 16 : 32) / 2);
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      u8g2.drawStr(centerX, centerY, string);
      u8g2.setFont((strlen(string) > 4) ? u8g2_font_open_iconic_all_2x_t : u8g2_font_open_iconic_all_4x_t);
      int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      u8g2.drawGlyph(centerGlX, centerGlY, (sys_jpn == true) ? 284 : 147);
    } else {
      int disCost = round(sys_cost * sys_currency_rate);
      char string[10];
      sprintf(string, "%d", disCost);
      u8g2.setFont(u8g2_font_logisoso32_tr);  // Choose your font
      int textWidth = u8g2.getStrWidth(string);
      int centerX = (u8g2.getWidth() - textWidth) / 2;
      int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
      u8g2.drawStr(centerX, centerY, string);
    }

    String lowbal = (sys_jpn == true) ? "プレイごとに" : "Cost per Play";
    u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
    int messageWidth = u8g2.getUTF8Width(lowbal.c_str());
    int centerMsgX = (u8g2.getWidth() - messageWidth) / 2;
    u8g2.drawUTF8(centerMsgX, 60, lowbal.c_str());

    u8g2.sendBuffer();
    displayState = 49;
  }
  setLEDs(CRGB::Black);
}
// Display Page 2 Display on Button Hold (Disabled) - DS 48
void displayButtonDisplayDisabled() {
  if (displayTimeout == 0 && displayState != 48) {
    u8g2.setPowerSave(0);
    u8g2.setContrast(128);
    u8g2.clearBuffer();

    u8g2.setFont(u8g2_font_HelvetiPixel_tr);  // Choose your font
    const char* string = WiFi.macAddress().c_str();
    int textWidth = u8g2.getStrWidth(string);
    int centerX = 28 + 5;
    int centerGlX = 5;
    int centerY = u8g2.getAscent() + 6;
    u8g2.drawStr(centerX, centerY, string);
    u8g2.setFont(u8g2_font_streamline_interface_essential_other_t);
    int centerGlY = u8g2.getAscent();
    u8g2.drawGlyph(centerGlX, centerGlY, 64);

    u8g2.sendBuffer();
    displayState = 48;
  }
}
// Turn Off Display and LED - DS 255
void sleepDevice() {
  if (displayTimeout == 0 && displayState != 255) {
    u8g2.clearBuffer();
    u8g2.sendBuffer();
    u8g2.setPowerSave(1);
    displayState = 255;
  }
  setLEDs(CRGB::Black);
}
// Set LED
void setLEDs(CRGB color) {
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = color;
  }
  FastLED.show();
}
// Blink LED and return to default
void blinkLEDs(CRGB color, int duration) {
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = color;
  }
  FastLED.show();
  delay(duration);
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Yellow;
  }
  FastLED.show();
}