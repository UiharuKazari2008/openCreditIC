# openCreditIC / PayPass
Cheap Networked RFID Reader(s) and cloud-free server for arcade cabinet credit payments. Uses card serial number for ID and local server to manage cards and balances

I hold no responsibility if you use this in a buiness as of the time of writing there is no encryption or authentication with the server/readers

## Features
* Supports low cost ESP32 based RFID Card readers (See make a card reader section)
* Local database
* API based depositing
* Per-User card management
* Per-User credits
* Locking of users and cards
* Free play mode (user, machine, and global)
* Per-machine credit cost
* Supports "AMaverlousDisplay" for displaying credit usage on WACCA cabinets
* Supports AmusementVISION overlays via callback

## Make a card reader
**Required hardware:**<br/>
* ESP32 Dev Module
* RFID-RC522
* 5V or 3.3V Relay
* LED with 1K resister connected to a LDR module with digial out
  * Or you can just use another 12v relay
  * or any other way of getting the 12v output of the coin blocker to a HIGH level on the blocker input

**Pinout:**<br/>
***I won't list how to wire up 5v, 3.3v, and gnd connections. Thats to easy***<br/>

Card Reader:<br/>
* NSS/Slave Select -> IO21
* SCK -> IO18
* MOSI -> IO23
* MISO -> IO19
* RST -> IO22

Coin Relay:<br/>
* Signal -> IO13

Digital LDR:<br/>
* DO -> IO14

If using a WS2812 LED, Connect its data pin to IO12

Flash the ino of the type of reader you are wanting to use
