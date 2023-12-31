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

#define SS_PIN 16     // Define the SS pin (Slave Select) for the RFID module.
#define RST_PIN 17    // Define the RST pin for the RFID module.
#define RELAY_PIN 13  // Define the pin connected to the relay.
#define BLOCK_PIN 14  // Define the pin connected to the LDR for Coin Blocking from cab
#define BUTTON_PIN 5  // Button used for front panel button
#define LED_PIN 12    // Define the pin connected to the WS2812 LED strip.
#define NUM_LEDS 1    // Define the number of LEDs in the strip.

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
TaskHandle_t Task1;
TaskHandle_t Task2;

int enableState = 0;
int blockState = 0;
int blockOverride = 0;
int displayState = -1;
bool waitingForUnblock = false;
bool lastButtonState = false;

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
  enableState = 1;
  Serial.println("Reader is ready to init");
  #ifdef MULTICORE_ENABLE
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
  }
}
#endif
// Primary Loop Function
void runtime() {
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
            displayButtonDisplayEnabled();
          }
        } else if (digitalRead(BUTTON_PIN) == HIGH && lastButtonState == true) {
          // Button was released
          lastButtonState = false;
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
            displayButtonDisplayDisabled();
          }
        } else if (digitalRead(BUTTON_PIN) == HIGH && lastButtonState == true) {
          // Button was released
          lastButtonState = false;
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
    String url = String(apiUrl) + "blocked_callback/" + WiFi.macAddress() + "/" + uid + "?key=" + deviceKey;
    Serial.println("Sending GET request to: " + url);
    http.begin(url);
    int httpCode = http.GET();
    http.end();
    Serial.println("HTTP Response code: " + String(httpCode));
    if (httpCode == 200) {
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

///////////////////////////////
// Display and LED Functions //
///////////////////////////////

// Display Standby Screen (Game Enabled) - DS 10
void displayStandbyScreen() {
  if (displayState != 10) {
    setLEDs(CRGB::Yellow);
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
}
// Display Standby Screen (Game Enabled) - DS 15
void displayEcoModeScreen() {
  if (displayState != 15) {
    setLEDs(CRGB::Black);
    u8g2.setPowerSave(0);
    u8g2.setContrast(1);
    u8g2.clearBuffer();
    const char* string = (sys_jpn == true) ? "省エネモード" : "Energy Saving";
    u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr);  // Choose your font
    int textWidth = u8g2.getUTF8Width(string);
    int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - 14;
    int centerX = ((u8g2.getWidth() - textWidth) / 2) + 14;
    int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2);
    u8g2.drawUTF8(centerX, centerY, string);
    u8g2.setFont(u8g2_font_streamline_ecology_t);
    int centerGlY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
    u8g2.drawGlyph(centerGlX, centerGlY, 58);
    u8g2.setDrawColor(1);
    u8g2.sendBuffer();
    displayState = 15;
  }
}
// Display Communication Started - DS Interupt
void displayStartComm(String uid) {
  displayState = -1;
  setLEDs(CRGB::Black);
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
// Display Credit Response - DS Interupt
void displayCreditReponse(int httpCode, String message) {
  displayState = -1;
  u8g2.setPowerSave(0);
  u8g2.setContrast(255);
  Serial.println(message);
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, message);
  const float cost = doc["cost"];
  const float balance = doc["balance"];
  const bool free_play = doc["free_play"];
  const int time_left = doc["time_left"];
  const bool currency_mode = doc["currency_mode"];
  const float currency_rate = (currency_mode) ? doc["currency_rate"] : 0;
  const bool jpn = doc["japanese"];
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
}
// Display Invalid Card - DS Interupt
void displayInvalidCard() {
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
}
// Display Account Issue Response - DS Interupt
void displayAccountIssue(int httpCode, String message) {
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
}
// Display Communication Error - DS Interupt (TODO)
void displayCommunicationError() {
  displayState = -1;
  setLEDs(CRGB::Black);
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
  if (displayState != 55) {
    setLEDs(CRGB::Black);
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
}
// Display Blockd Callback "Wait a moment" - DS 50
void displayBootUpReader() {
  if (displayState != 50) {
    setLEDs(CRGB::Black);
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
}
// Display Page 2 Display on Button Hold (Enabled) - DS 49
void displayButtonDisplayEnabled() {
  if (displayState != 49) {
    setLEDs(CRGB::Black);
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
}
// Display Page 2 Display on Button Hold (Disabled) - DS 48
void displayButtonDisplayDisabled() {
  if (displayState != 48) {
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
  if (displayState != 255) {
    u8g2.clearBuffer();
    u8g2.sendBuffer();
    setLEDs(CRGB::Black);
    FastLED.show();
    u8g2.setPowerSave(1);
    displayState = 255;
  }
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
