#include <SPI.h>
#include <MFRC522.h>
#include <WebServer.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <U8g2lib.h> // Include the U8g2 library for OLED display.
#include <ArduinoJson.h>
#include <FastLED.h>

#define SS_PIN    16  // Define the SS pin (Slave Select) for the RFID module.
#define RST_PIN   17 // Define the RST pin for the RFID module.
#define RELAY_PIN 13 // Define the pin connected to the relay.
#define BLOCK_PIN 14 // Define the pin connected to the LDR for Coin Blocking from cab
#define BUTTON_PIN 5 // Button used for front panel button
#define LED_PIN   12 // Define the pin connected to the WS2812 LED strip.
#define NUM_LEDS  1  // Define the number of LEDs in the strip.

CRGB leds[NUM_LEDS]; // Create an array of CRGB colors for the LEDs.
MFRC522 mfrc522(SS_PIN, RST_PIN); // Create an MFRC522 instance.
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0);
const char *ssid = "Radio Noise AX";
const char *password = "Radio Noise AX";
WebServer server(80);
const char *apiUrl = "http://card-services.nyti.ne.jp:1777/";
const char *deviceKey = "";
bool sys_jpn = false;
bool sys_currency_mode = false;
float sys_currency_rate = 1;

void setup() {
  Serial.begin(115200);
  pinMode(21, OUTPUT);
  pinMode(22, OUTPUT);
  SPI.begin(); // Initialize SPI communication.
  mfrc522.PCD_Init(); // Initialize the RFID module.
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_48dB);
  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS); // Initialize the LED strip.
  u8g2.begin();
  u8g2.enableUTF8Print();
  setLEDs(CRGB::Black);
  FastLED.setBrightness(255);
  FastLED.clear();
  FastLED.show();
  bootScreen("INIT");

  checkWiFiConnection();

  server.begin();
  Serial.println("Ready to for commands...");
  standbyScreen();
}
void loop() {
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String uid = getUID();
    Serial.print("Card Detected: ");
    Serial.println(uid);
    handleStartComm(uid);

    HTTPClient http;
    String url = String(apiUrl) + "callback/" + WiFi.macAddress() + "/" + uid + "?key=" + deviceKey;
    Serial.println("Sending GET request to: " + url);
    http.begin(url);
    int httpCode = http.GET();
    String httpResponse = http.getString();
    http.end();
    Serial.println("HTTP Response code: " + String(httpCode));

    if (httpCode == 200) {
      Serial.println("Card OK, Deposited Credit");
      handleAddedCreditsReponse(httpResponse);
      standbyScreen();
    } else if (httpCode == 210 || httpCode == 215) {
      Serial.println("Card OK, Registered Card");
      handleRegisterReponse(httpCode, httpResponse);
    } else if (httpCode == 404 || httpCode == 400) {
      Serial.println("Card Denied! " + uid);
      handleInvalidCard(httpCode, uid);
      standbyScreen();
    } else {
      standbyScreen();
      delay(2000);
    }
  }
  checkWiFiConnection();
  server.handleClient();
}

String getUID() {
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}
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
    getConfig();
    delay(1000);
  }
}
void getConfig() {
  HTTPClient http;
  String url = String(apiUrl) + "get/machine/" + WiFi.macAddress() + "?key=" + deviceKey;
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
    sys_currency_mode = doc["currency_mode"];
    sys_currency_rate = (sys_currency_mode == true) ? doc["currency_rate"] : 0;
    sys_jpn = doc["japanese"];
  }
}
void bootScreen(String input_message) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_HelvetiPixel_tr); // Choose your font
  const char* string = input_message.c_str();
  int textWidth = u8g2.getStrWidth(string);
  int centerX = ((u8g2.getWidth() - textWidth) / 2) + (28 / 2);
  int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - (28 / 2);
  int centerY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
  u8g2.drawStr(centerX, centerY, string);
  u8g2.setFont(u8g2_font_streamline_interface_essential_other_t);
  int centerGlY = u8g2.getHeight() / 2 + u8g2.getAscent() / 2;
  u8g2.drawGlyph(centerGlX, centerGlY, 64);
  u8g2.setFont(u8g2_font_HelvetiPixel_tr);
  String message = WiFi.macAddress();
  int messageWidth = u8g2.getStrWidth(message.c_str());
  int centerMsgX = (u8g2.getWidth() - messageWidth) / 2;
  u8g2.drawStr(centerMsgX, 56, message.c_str());
  u8g2.sendBuffer();
}
void standbyScreen() {
  setLEDs(CRGB::Yellow);
  u8g2.setPowerSave(0);
  u8g2.setContrast(1);
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
  int centerGlX = (u8g2.getWidth() - 32) / 2;
  int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
  u8g2.drawGlyph(centerGlX, centerGlY, 263);
  u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr); // Choose your font
  const char* string = (sys_jpn == true) ? "カードをタップします!": "Tap your card!";
  int textWidth = u8g2.getUTF8Width(string);
  int centerX = (u8g2.getWidth() - textWidth) / 2;
  u8g2.drawUTF8(centerX, (sys_jpn == true) ? 54 : 55, string);
  u8g2.sendBuffer();
}
void handleStartComm(String uid) {
  setLEDs(CRGB::Black);
  u8g2.setContrast(1);
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
  int centerGlX = (u8g2.getWidth() - 32) / 2;
  int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
  u8g2.drawGlyph(centerGlX, centerGlY, 84);
  u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr); // Choose your font
  const char* string = (sys_jpn == true) ?  "接続中" : "Communicating...";
  int textWidth = u8g2.getUTF8Width(string);
  int centerX = (u8g2.getWidth() - textWidth) / 2;
  u8g2.drawUTF8(centerX, 55, string);
  u8g2.sendBuffer();
}
void handleInvalidCard(int httpCode, String uid) {
  setLEDs(CRGB::Red);
  u8g2.setContrast(255);
  u8g2.clearBuffer();
  u8g2.setDrawColor(1);
  u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
  u8g2.sendBuffer();
  u8g2.setDrawColor(0);
  u8g2.setColorIndex(0);
  u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
  int centerGlX = (u8g2.getWidth() - 32) / 2;
  int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
  u8g2.drawGlyph(centerGlX, centerGlY, 121);
  u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr); // Choose your font
  const char* string = (httpCode == 404) ? ((sys_jpn == true) ? "カードが存在します" : "Card Exists") : ((sys_jpn == true) ? "無効なカード" : "Unregistered Card");
  int textWidth = u8g2.getUTF8Width(string);
  int centerX = (u8g2.getWidth() - textWidth) / 2;
  u8g2.drawUTF8(centerX, 55, string);
  u8g2.setDrawColor(1);
  u8g2.sendBuffer();
  int count = 3;
  delay(250);
  while(count > 0 ) {
    u8g2.setContrast(1);
    delay(500);
    u8g2.setContrast(255);
    delay(500);
    count = count -1;
  }
}
void handleAddedCreditsReponse(String message) {
  u8g2.setContrast(255);
  Serial.println(message);
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, message);
  const bool status = doc["status"];
  const float balance = doc["balance"];
  const bool free_play = doc["free_play"];
  const bool currency_mode = doc["currency_mode"];
  const float currency_rate = (currency_mode) ? doc["currency_rate"] : 0;
  const bool jpn = doc["japanese"];

  u8g2.clearBuffer();
  if (status == true) {
    u8g2.setDrawColor(1);
    u8g2.drawBox(0, 0, u8g2.getWidth(), u8g2.getHeight());
    u8g2.sendBuffer();
    u8g2.setDrawColor(0);
    u8g2.setColorIndex(0);
  }
  setLEDs(CRGB::Cyan);
  float true_balance = balance;
  if (free_play == true) {
    const char* string = "FREEPLAY";
    u8g2.setFont(u8g2_font_logisoso20_tr); // Choose your font
    int textWidth = u8g2.getStrWidth(string);
    int centerX = (u8g2.getWidth() - textWidth) / 2;
    int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
    u8g2.drawStr(centerX, centerY, string);
  } else if (currency_mode == true) {
    true_balance = balance * currency_rate;
    int disBalance = round(true_balance);
    char string[10];
    sprintf(string, "%d", disBalance);
    u8g2.setFont((strlen(string) > 4) ? u8g2_font_logisoso16_tr : u8g2_font_logisoso32_tr); // Choose your font
    int textWidth = u8g2.getStrWidth(string);
    int centerX = ((u8g2.getWidth() - textWidth) / 2) + (((strlen(string) > 4) ? 16 : 32) / 2);
    int centerGlX = ((u8g2.getWidth() - textWidth) / 2) - (((strlen(string) > 4) ? 16 : 32) / 2);
    int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
    u8g2.drawStr(centerX, centerY, string);

    u8g2.setFont((strlen(string) > 4) ? u8g2_font_open_iconic_all_2x_t : u8g2_font_open_iconic_all_4x_t);
    int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
    u8g2.drawGlyph(centerGlX, centerGlY, (jpn == true) ? 284 : 147);
  } else {
    int disBalance = round(true_balance);
    char string[10];
    sprintf(string, "%d", disBalance);
    u8g2.setFont(u8g2_font_logisoso32_tr); // Choose your font
    int textWidth = u8g2.getStrWidth(string);
    int centerX = (u8g2.getWidth() - textWidth) / 2;
    int centerY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 5;
    u8g2.drawStr(centerX, centerY, string);
  }

  String textBottom = (sys_jpn == true) ? "ウォレット残高" : "Wallet Balance";
  u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr); // Choose your font
  int messageWidth = u8g2.getUTF8Width(textBottom.c_str());
  int centerMsgX = (u8g2.getWidth() - messageWidth) / 2;
  u8g2.drawUTF8(centerMsgX, 60, textBottom.c_str());

  u8g2.setDrawColor(1);
  u8g2.sendBuffer();

  delay(500);
  setLEDs(0x808080);
  delay(2500);
}
void handleRegisterReponse(int httpCode, String message) {
  u8g2.setContrast(255);
  Serial.println(message);
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, message);
  const bool jpn = doc["japanese"];

  u8g2.clearBuffer();
  setLEDs(CRGB::Cyan);

  u8g2.setFont(u8g2_font_open_iconic_all_4x_t);
  int centerGlX = (u8g2.getWidth() - 32) / 2;
  int centerGlY = (u8g2.getHeight() / 2 + u8g2.getAscent() / 2) - 10;
  u8g2.drawGlyph(centerGlX, centerGlY, (httpCode == 215) ? 81 : 120);
  u8g2.setFont((sys_jpn == true) ? u8g2_font_b12_t_japanese1 : u8g2_font_HelvetiPixel_tr); // Choose your font
  const char* string = (httpCode == 215) ? ((sys_jpn == true) ? "新しいタップカード" : "Tap new card") : ((sys_jpn == true) ? "カード登録済み" : "Card Enrolled");
  int textWidth = u8g2.getUTF8Width(string);
  int centerX = (u8g2.getWidth() - textWidth) / 2;
  u8g2.drawUTF8(centerX, 55, string);
  u8g2.setDrawColor(1);
  u8g2.sendBuffer();

  delay(500);
  setLEDs(0x808080);
  delay(2500);
  if (httpCode != 215) {
      standbyScreen();
  }
}
void setLEDs(CRGB color) {
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = color;
  }
  FastLED.show();
}
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
