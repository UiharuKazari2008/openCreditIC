#include <SPI.h>
#include <MFRC522.h>
#include <WebServer.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define SS_PIN    21  // Define the SS pin (Slave Select) for the RFID module.
#define RST_PIN   22 // Define the RST pin for the RFID module.
#define RELAY_PIN 13 // Define the pin connected to the relay.
#define BLOCK_PIN 14 // Define the pin connected to the LDR for Coin Blocking from cab

MFRC522 mfrc522(SS_PIN, RST_PIN); // Create an MFRC522 instance.
const char *ssid = "Radio Noise AX";
const char *password = "Radio Noise AX";
WebServer server(80);
const char *apiUrl = "http://card-services.nyti.ne.jp:1777/";
int enableState = 0;
int testReader = 0;
int blockState = 0;
int blockOverride = 0;

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BLOCK_PIN, INPUT);
  digitalWrite(RELAY_PIN, LOW); // Initially, set the relay to OFF.

  SPI.begin(); // Initialize SPI communication.
  mfrc522.PCD_Init(); // Initialize the RFID module.

  checkWiFiConnection();

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
  server.on("/test/reader", [=]() {
    if (testReader == 0) {
      testReader = 1;
    } else {
      testReader = 0;
    }
    enableState = 1;
    Serial.print("Set test mode: ");
    Serial.println((testReader == 1) ? "Overided" : "Normal");
    server.send(200, "text/plain", (testReader == 1) ? "Reader Test Mode" : "Normal Mode");
  });
  server.on("/credit", [=]() {
    Serial.println("Direct Inject, Dispense Credit");
      handleDispenseCoin();
    server.send(200, "text/plain", "OK");
  });
  server.on("/enable", [=]() {
    if (blockState = 0) {
    }
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

  server.begin();
  enableState = 1;
  Serial.println("Ready to scan RFID cards...");
}

void loop() {
  if (digitalRead(BLOCK_PIN) == HIGH && blockOverride == 0) {
    handleBlocked();
  } else if (blockState == 1) {
    handleUnblocking();
  } else if (enableState == 1 && mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    // A new card is detected, read its UID.
    String uid = getUID();
    Serial.print("Card Detected: ");
    Serial.println(uid);
    int response = sendRequest(uid);
    if (response >= 200 && response < 300) {
      Serial.println("Card OK, Dispense Credit");
      handleDispenseCoin();
      delay(3000);
      if (response == 200) {

      } else {

      }
    } else if (response == 400) {
      Serial.println("Card OK, No Avalible Balance! " + uid);
      delay(3000);
    } else {
      Serial.println("Card Denied! " + uid);
      delay(3000);
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
    Serial.println("WiFi not connected. Attempting to reconnect...");
    WiFi.hostname("SimpleCard");
    WiFi.disconnect(true);
    WiFi.begin(ssid, password);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
    int tryCount = 0;
    while (WiFi.status() != WL_CONNECTED) {
      if (tryCount > 30) {
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
  }
}
int sendRequest(String cardUID) {
  HTTPClient http;
  String url = String(apiUrl) + "dispense/" + WiFi.macAddress() + "/" + cardUID;
  Serial.println("Sending GET request to: " + url);
  http.begin(url);
  int httpCode = http.GET();
  http.end();
  Serial.println("HTTP Response code: " + String(httpCode));
  return httpCode;
}

void handleBlocked() {
  if (blockState == 0) {
    blockState = 1;
    Serial.println("Game has disabled card reader!");
  }
}
void handleUnblocking() {
  blockState = 0;
  enableState = 1;
  Serial.println("Game has enabled card reader!");
}
void handleDispenseCoin() {
  digitalWrite(RELAY_PIN, HIGH);
  delay(100);
  digitalWrite(RELAY_PIN, LOW);
}
