![favicon-96x96.png](web%2Fstatic%2Fimg%2Ffavicon-96x96.png)
# openCreditIC / PayPass
Cheap Networked RFID Reader(s) and cloud-free server for arcade cabinet credit payments. Uses card serial number for ID and local server to manage cards and balances

![Screen Shot 2023-09-15 at 13.05.11.png](.assets%2FScreen%20Shot%202023-09-15%20at%2013.05.11.png)

## NOTICE
At this time, I don't take responsibility for any damages caused if this is used commercially. Once this warning is removed you can consider the software to be "production" ready. More testing and feedback is still required

Please create issues to address feature requests and report bugs.

## Features
* ESP32-based RFID Card reader designed for low cast and easy build
* No Internet Access Required! *(after npm install)*
* Local Database
* Simple Web Interface for day to day tasks
* Per-User Multi-Card management
* Per-User Credit management
* Card and User Locking
* Toggleable Free Play (User, Machine, and Global)
* Per-machine Credit Cost
* Currency Mode Support (1 Credit = 100 Yen/Dollar/Euro)
* Cooldown and Anti-Hogging
  * X Credits per X Minutes
  * Anti-hogging can be used to set max number of credits per minutes to prevent hogging of cabinets
* Addressable POS Card Reader to provision cards and add credits
* Credit Withdraw History
* Credit Deposit History
* Supports multiple sites/locations 

## TODO
* VFD RS232 Communication (Currently requires AMaverlousDisplay)
* Cleanup of Arduino Code
* Card Reader check in
* Encrypted communication

## Integrations
Supports various other ACR developed Arcade solutions
- AMaverlousDisplay: Displaying Information on WACCA Cabinets
- AmusementVISION: Displaying Information on video outputs
- Supports simple URL callbacks for:
  - On Credit Dispensed
  - On Valid Card Tap when Coin Blocked is activated
    - Example: Power on cabinet when powered off

## Installation
1. Install NodeJS on your system of choice
2. Clone this Git repo and cd into it
3. `npm install`
4. Create `config.json`
```json
{
  "arcade_name": "Arcade Name",
  "device_key": "API_KEY_FOR_CARD_READERS",
  "web_key": "WEB_ACCESS_API_KEY", /*If removed there is no login required*/
  "show_delete_actions": false /*Shows the Delete Card and Delete User Options*/
}
```
5. `node ./card-server.js`

Use something like pm2 or systemd to run as a daemon 

## Example Card Reader Designs
Here are card readers that I have made and implemented as an example
### WACCA (Built into lower panel)
The card reader is mounted in the extra open window beside the coin slot<br/>
All The hardware in this example is in-assessable to the user<br/>
The relay is mounted flat to prevent bumping to insert credits<br/>
![293147B0-65E0-4950-ADFC-98D98986AEED_1_105_c copy.png](.assets%2F293147B0-65E0-4950-ADFC-98D98986AEED_1_105_c%20copy.png)<br/>

### Chunithm (Builtin to slider)
![IMG_5375 copy.png](.assets%2FIMG_5375%20copy.png)<br/>
The card reader is mounted inside the ground slider, Foam backing is to prevent reader from getting to close to the metal backplate and causing issues with the reader<br/>
LED is mounted next to the "per play" indicator and is boxed to increase brightness<br/>
OLED Display is mounted over the coin slot<br/>
Button is added for future features<br/> 
The relay is mounted flat to prevent bumping to insert credits<br/>
![1220D9A7-78DD-44F6-A787-B858C4AB2103_1_105_c.png](.assets%2F1220D9A7-78DD-44F6-A787-B858C4AB2103_1_105_c.png)<br/>
![10F6503A-9D1E-43A1-B554-D1E3282296A3_1_105_c copy.png](..%2F..%2FDownloads%2F10F6503A-9D1E-43A1-B554-D1E3282296A3_1_105_c%20copy.png)<br/>

### POS Card Reader (with coin slot replacement reader)
Using the coin slot replacement reader design mounted on project box with the MCU inside.<br/>
![03E5694C-D425-44A0-A6B3-810B7E8010AF_1_102_o copy.png](.assets%2F03E5694C-D425-44A0-A6B3-810B7E8010AF_1_102_o%20copy.png)<br/>
![DED6BF8A-4EB7-40FF-B5D4-94D3E9F0AC93_1_102_o copy.png](..%2F..%2FDownloads%2FDED6BF8A-4EB7-40FF-B5D4-94D3E9F0AC93_1_102_o%20copy.png)<br/>
Mounting screws are designed to work with most coin slots

## 3D printable designs
![Screenshot 2023-09-15 134619.png](.assets%2FScreenshot%202023-09-15%20134619.png)<br/>
See the included STL files inside the `./printable` folder

## Card Reader Hardware
### Warning
It is expected that th card readers and the server are on there on dedicated wireless network in the case that this is running in a public arcade. As this is updated more security will be added.
### Configuration File
Create `config.h` inside the CardReader-* folder
```c
const char *ssid = "OCI_NET";
const char *password = "OCI_NET_SECURE029587";
const char *apiUrl = "http://192.168.0.2:1777/"; // URL to access central server
const char *deviceKey = "API_KEY_FOR_CARD_READERS"; // device_key from config.json
```
### Hardware
Any Optional hardware can be ommited and the reader will work the same
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
  * deviceKey - device_key from config.json
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
