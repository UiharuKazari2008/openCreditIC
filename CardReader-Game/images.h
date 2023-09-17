#ifdef DISPLAY_I2C_128x32
  static const unsigned char bootLogo [] PROGMEM = {
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x07, 0x00, 
    0xFF, 0x01, 0xFE, 0x00, 0xC0, 0x01, 0x80, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0x07, 0x00, 0xFE, 0x00, 0x3E, 0x00, 0xC0, 0x00, 0x80, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x03, 0x00, 0x7C, 0x00, 0x1E, 0x00, 
    0x60, 0x00, 0x80, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x03, 0x0F, 
    0x7C, 0x00, 0x1E, 0x00, 0x20, 0x00, 0x80, 0xFF, 0xFF, 0x0F, 0xF0, 0x1F, 
    0x0C, 0x3F, 0x00, 0x1F, 0x3C, 0x00, 0x0E, 0xF0, 0x3F, 0xC0, 0xFF, 0xFF, 
    0xFF, 0x0F, 0xC0, 0x0F, 0x0C, 0x1F, 0x80, 0x1F, 0x1C, 0x08, 0x26, 0xF8, 
    0x5F, 0xF0, 0xFF, 0xFF, 0xFF, 0x07, 0x80, 0x07, 0x0C, 0x0F, 0x81, 0x0F, 
    0x1C, 0x0C, 0x3E, 0xF8, 0x7F, 0xF0, 0xFF, 0xFF, 0xFF, 0x87, 0x87, 0x03, 
    0x1C, 0x86, 0x81, 0x0F, 0x0E, 0x0C, 0x3E, 0x00, 0x7C, 0x00, 0xF8, 0xFF, 
    0xFF, 0x87, 0x87, 0x03, 0x1C, 0xC2, 0xC1, 0x07, 0x0E, 0x0E, 0x3E, 0x00, 
    0x78, 0x00, 0xF0, 0xFF, 0xFF, 0x83, 0x87, 0x21, 0x1C, 0xE0, 0x00, 0x00, 
    0x07, 0x0E, 0x3E, 0x00, 0xF8, 0x00, 0xE0, 0xFF, 0xFF, 0xC3, 0xC3, 0x20, 
    0x3C, 0xF0, 0x00, 0x00, 0x03, 0x07, 0x7E, 0x00, 0xF8, 0x01, 0xE0, 0xFF, 
    0xFF, 0x03, 0xC0, 0x30, 0x3C, 0xF8, 0x00, 0x80, 0x03, 0x00, 0xFE, 0x3F, 
    0xF8, 0x7F, 0xE0, 0xFF, 0xFF, 0x01, 0x60, 0x30, 0x3C, 0x78, 0x00, 0xE0, 
    0x01, 0x00, 0xFE, 0x3F, 0xF8, 0x7F, 0xF0, 0xFF, 0xFF, 0x01, 0x70, 0x00, 
    0x3C, 0x7C, 0xE0, 0xFF, 0x01, 0x00, 0xFE, 0x0F, 0xF8, 0x3F, 0xF0, 0xFF, 
    0xFF, 0xE1, 0x3F, 0x00, 0x3C, 0x7C, 0xE0, 0xFF, 0xC0, 0x07, 0x06, 0x00, 
    0x1C, 0x00, 0xF0, 0xFF, 0xFF, 0xE1, 0x1F, 0x3C, 0x1C, 0x7C, 0xF0, 0x7F, 
    0xE0, 0x07, 0x06, 0x00, 0x1E, 0x00, 0xF8, 0xFF, 0xFF, 0xE0, 0x1F, 0x3E, 
    0x1C, 0x3E, 0xF0, 0x7F, 0xE0, 0x07, 0x06, 0x00, 0x0E, 0x00, 0xFC, 0xFF, 
    0xFF, 0xF0, 0x0F, 0x3E, 0x1C, 0x3E, 0xF0, 0x3F, 0xF0, 0x07, 0x06, 0x80, 
    0x0F, 0x00, 0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  };
  const int bootLogo_w = 128;
  const int bootLogo_h = 32;
#else
  static const unsigned char bootLogo [] PROGMEM = {
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x07, 0x00, 0xFF, 0x01, 0xFE, 0x00,
        0xC0, 0x01, 0x80, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x07, 0x00,
        0xFE, 0x00, 0x3E, 0x00, 0xC0, 0x00, 0x80, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0x03, 0x00, 0x7C, 0x00, 0x1E, 0x00, 0x60, 0x00, 0x80, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x03, 0x0F, 0x7C, 0x00, 0x1E, 0x00,
        0x20, 0x00, 0x80, 0xFF, 0xFF, 0x0F, 0xF0, 0x1F, 0x0C, 0x3F, 0x00, 0x1F,
        0x3C, 0x00, 0x0E, 0xF0, 0x3F, 0xC0, 0xFF, 0xFF, 0xFF, 0x0F, 0xC0, 0x0F,
        0x0C, 0x1F, 0x80, 0x1F, 0x1C, 0x08, 0x26, 0xF8, 0x5F, 0xF0, 0xFF, 0xFF,
        0xFF, 0x07, 0x80, 0x07, 0x0C, 0x0F, 0x81, 0x0F, 0x1C, 0x0C, 0x3E, 0xF8,
        0x7F, 0xF0, 0xFF, 0xFF, 0xFF, 0x87, 0x87, 0x03, 0x1C, 0x86, 0x81, 0x0F,
        0x0E, 0x0C, 0x3E, 0x00, 0x7C, 0x00, 0xF8, 0xFF, 0xFF, 0x87, 0x87, 0x03,
        0x1C, 0xC2, 0xC1, 0x07, 0x0E, 0x0E, 0x3E, 0x00, 0x78, 0x00, 0xF0, 0xFF,
        0xFF, 0x83, 0x87, 0x21, 0x1C, 0xE0, 0x00, 0x00, 0x07, 0x0E, 0x3E, 0x00,
        0xF8, 0x00, 0xE0, 0xFF, 0xFF, 0xC3, 0xC3, 0x20, 0x3C, 0xF0, 0x00, 0x00,
        0x03, 0x07, 0x7E, 0x00, 0xF8, 0x01, 0xE0, 0xFF, 0xFF, 0x03, 0xC0, 0x30,
        0x3C, 0xF8, 0x00, 0x80, 0x03, 0x00, 0xFE, 0x3F, 0xF8, 0x7F, 0xE0, 0xFF,
        0xFF, 0x01, 0x60, 0x30, 0x3C, 0x78, 0x00, 0xE0, 0x01, 0x00, 0xFE, 0x3F,
        0xF8, 0x7F, 0xF0, 0xFF, 0xFF, 0x01, 0x70, 0x00, 0x3C, 0x7C, 0xE0, 0xFF,
        0x01, 0x00, 0xFE, 0x0F, 0xF8, 0x3F, 0xF0, 0xFF, 0xFF, 0xE1, 0x3F, 0x00,
        0x3C, 0x7C, 0xE0, 0xFF, 0xC0, 0x07, 0x06, 0x00, 0x1C, 0x00, 0xF0, 0xFF,
        0xFF, 0xE1, 0x1F, 0x3C, 0x1C, 0x7C, 0xF0, 0x7F, 0xE0, 0x07, 0x06, 0x00,
        0x1E, 0x00, 0xF8, 0xFF, 0xFF, 0xE0, 0x1F, 0x3E, 0x1C, 0x3E, 0xF0, 0x7F,
        0xE0, 0x07, 0x06, 0x00, 0x0E, 0x00, 0xFC, 0xFF, 0xFF, 0xF0, 0x0F, 0x3E,
        0x1C, 0x3E, 0xF0, 0x3F, 0xF0, 0x07, 0x06, 0x80, 0x0F, 0x00, 0xFE, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0xFF,
  };
  const int bootLogo_w = 128;
  const int bootLogo_h = 64;
#endif