# openCreditIC / PayPass
Cheap Networked RFID Reader(s) and cloud-free server for arcade cabinet credit payments. Uses card serial number for ID and local server to manage cards and balances

I hold no responsibility if you use this in a buiness as of the time of writing there is no encryption or authentication with the server/readers

## Features
* ESP32-based RFID Card reader designed for low cast and easy build
* No Internet Access Required!
* Local Database and No Cloud Anything!
* Simple URL based administration
* Per-User Multi-Card management
* Per-User Credit management
* Card and User Locking
* Toggleable Free play mode (User, Machine, and Global)
* Per-machine Credit Cost
* Currency Mode Support (1 Credit = 100 Yen/Dollar/Euro)
* Cooldown and Anti-Hogging
  * X Credits per X Minutes
  * Anti-hogging can be used to set max number of credits per minutes to prevent hogging of cabinets
* POS Card Reader to provision cards and add credits
* Credit Withdraw History
* Credit Deposit History

## TODO
* Web Interface
* VFD RS232 Communication (Currently requires AMaverlousDisplay)
* Cleanup of Arduino Code
* Separate config.h for Arduino
* Card Reader check in
* Encrypted communication
* Login/API key for server

## Integrations
Supports various other ACR developed Arcade solutions
- AMaverlousDisplay: Displaying Information on WACCA Cabinets
- AmusementVISION: Displaying Information on video outputs
- Supports simple URL callbacks for:
  - On Credit Dispensed
  - On Valid Card Tap when Coin Blocked is activated
    - Example: Power on cabinet when powered off

## Installation
1. Install OS on a Raspberry Pi
2. Install NodeJS
3. Clone this Git repo and cd into it
4. `npm install`
5. `node ./card-server.js`

Use something like pm2 or systemd to run as a daemon 

## Card Reader Design
### Warning
It is expected that th card readers and the server are on there on dedicated wireless network in the case that this is running in a public arcade. As this is updated more security will be added.
### Hardware
* ESP32 Dev Module
* RFID-RC522 RFID Module
* Credit Trigger
  * 5v/3.3v Relay with trigger on HIGH
  * or Optocoupler Isolation Board
* Coin Enable
  * LED + Digital LDR with trigger on HIGH
  * or Optocoupler Isolation Board (12v Input)
* RGB LED (WS2812) ***(Optional, Not Required)***
* OLED Display (SSD1306 128X64 I2C) ***(Optional, Suggested)***

### Pinout
* RFID-RC522
  * SDA/NSS/Slave Select -> **IO16**
  * SCK/Clock -> **IO18**
  * MOSI -> **IO23**
  * MISO -> **IO19**
  * GND -> **GND Bus**
  * RST -> **IO17**
  * 3.3v -> **3.3v Bus**
* Credit Add Relay
  * GND -> **GND Bus**
  * Trigger -> **IO13**
  * 5v -> **5v Bus**
* Coin Blocker
  * GND -> **GND Bus**
  * DO -> **IO14**
  * 3.3v -> **3.3v Bus**
* WS2812 Indicator LED *(Optional)*
  * GND -> **GND Bus**
  * IN -> **IO12**
  * 5v -> **5v Bus**
* I2C OLED Display *(Optional)*
  * GND -> **GND Bus**
  * SCL/Clock -> **IO22**
  * SDA/Data -> **IO21**
  * 5v -> **5v Bus**

### Flashing Firmware
* Connect via USB and launch Arduino IDE
* Install the following libraries
  * MFRC522
  * FastLED
  * ArduinoJSON
  * U8G2
* Open the project
  * CardReader-Game - Designed for games
  * CardReader-POS - Designed for POS reader (No Relay/No Coin Blocker)
* Set the following varibles
  * ssid - WiFi network Name
  * password - WiFi network password
  * apiUrl - IP/FQDN to access the server
* Build and Flash your card readers

## Configuration
Use the following URLs to set settings with your server
* `/set/arcade/cost/<NUMBER>`: Set Per Play Cost
  * `/set/machine/cost/<MAC_ADDRESS>/<NUMBER>` (Per Machine)
* `/set/arcade/low_balance/<NUMBER>`: Set Low Balance Alert 
  * When users wallet balance falls below this number the display will display a warning and the LED will flash
* `/set/arcade/currency/<NUMBER>`: Set the currency to credit multiplier (use "null" as value to disable)
  * Once set Credits will be prefixed with Yen or Dollar symbol and will be multiplied based on that value
* `/set/arcade/freeplay/<enable or disable>`: Sets global freeplay mode
  * `/set/machine/freeplay/<MAC_ADDRESS>/<enable or disable>`: (Set Machine Freeplay)
* `/set/arcade/cooldown/<Credits:NUMBER>/<Minutes:NUMBER>`: Cooldown timeout - Sets max number of credits per X minutes
* `/set/arcade/antihog/<Credits:NUMBER>/<Minutes:NUMBER>`: Antihogging per machine timeout - Sets max number of credits per X minutes
  * `/set/machine/antihog/<Credits:NUMBER>/<Minutes:NUMBER>`: (Set Machine)
* `/set/arcade/japanese/<enable or disable>`: Enable Japanese Text and Currency
  * `/set/machine/japanese/<MAC_ADDRESS>/<enable or disable>`: (Set Machine)

### Advanced
* `/set/machine/vfd/<MAC_ADDRESS>/<VFD_IP>/<VFD_PORT>`: Set VFD connection
* `/set/machine/blocked_callback/<MAC_ADDRESS>/<URL_ENCODED_URL>`: URL to call on blocked tap
* `/set/machine/withdraw_callback/<MAC_ADDRESS>/<URL_ENCODED_URL>`: URL to call on credit dispensed

## "Day to Day Operations"
### Card Registration
Use one of the following `/register/scan` or `/register/scan/<USERNAME>` URLs, If you dont use a username it will generate a random one.<br/>
You can also configure the following via queries on the url (`?option=value&option=value`)
* `credits`: Number of credits to add to the new card
* `user_name`: Users Display Name
* `contact`: Contact Info
* `card_name`: Card Friendly Name
* `card_contact`: Card Contact Info

Tap th card on the POS reader within 30 secounds, It will give a checkmark if successful

You can also use `/register/new/:user/:card` to register a new card if you know the serial number of the card in hex

### Deposit Credits
Use `/deposit/scan/<NUMBER_OF_CREDITS>` to register the request and tap a card within 30 seconds

You can also use `/deposit/card/:card/:credits` to deposit if you know the card serial or `/deposit/user/:user/:credits` if you know the user ID
