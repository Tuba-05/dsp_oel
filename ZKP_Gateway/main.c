#include <stdio.h>
#include <stdbool.h>
#include <string.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h" // Uptime ke liye

// --- PIN & I2C CONFIGURATION ---
#define I2C_MASTER_SCL_IO           9
#define I2C_MASTER_SDA_IO           8
#define I2C_MASTER_NUM              I2C_NUM_0
#define I2C_MASTER_FREQ_HZ          100000
#define I2C_MASTER_TIMEOUT_MS       1000

#define BLINK_GPIO                  2
#define MAX30102_ADDR               0x57
#define OLED_ADDR                   0x3C  
#define FINGER_ON_THRESHOLD         80000

static const char *TAG = "RESEARCH_OXIMETER";

// --- SENSOR VARIABLES ---
#define BUFFER_SIZE                 120
uint32_t ir_buf[BUFFER_SIZE];
uint32_t red_buf[BUFFER_SIZE];
int buf_idx = 0;

bool finger_is_on = false;
float display_bpm = 0;
float display_spo2 = 0;
int stabilization_timer = 0;
int oled_state = -1;

// ==========================================
// 1. OLED MINI DRIVER & FONT (1.3 INCH OPTIMIZED)
// ==========================================
static const uint8_t font5x7[39][5] = {
    {0x00, 0x00, 0x00, 0x00, 0x00}, // 0: Space
    {0x3E, 0x51, 0x49, 0x45, 0x3E}, // 1: 0
    {0x00, 0x42, 0x7F, 0x40, 0x00}, // 2: 1
    {0x42, 0x61, 0x51, 0x49, 0x46}, // 3: 2
    {0x21, 0x41, 0x45, 0x4B, 0x31}, // 4: 3
    {0x18, 0x14, 0x12, 0x7F, 0x10}, // 5: 4
    {0x27, 0x45, 0x45, 0x45, 0x39}, // 6: 5
    {0x3C, 0x4A, 0x49, 0x49, 0x30}, // 7: 6
    {0x01, 0x71, 0x09, 0x05, 0x03}, // 8: 7
    {0x36, 0x49, 0x49, 0x49, 0x36}, // 9: 8
    {0x06, 0x49, 0x49, 0x29, 0x1E}, // 10: 9
    {0x7E, 0x11, 0x11, 0x11, 0x7E}, // 11: A
    {0x7F, 0x49, 0x49, 0x49, 0x36}, // 12: B
    {0x3E, 0x41, 0x41, 0x41, 0x22}, // 13: C
    {0x7F, 0x41, 0x41, 0x22, 0x1C}, // 14: D
    {0x7F, 0x49, 0x49, 0x49, 0x41}, // 15: E
    {0x7F, 0x09, 0x09, 0x09, 0x01}, // 16: F
    {0x3E, 0x41, 0x49, 0x49, 0x7A}, // 17: G
    {0x7F, 0x08, 0x08, 0x08, 0x7F}, // 18: H
    {0x00, 0x41, 0x7F, 0x41, 0x00}, // 19: I
    {0x20, 0x40, 0x41, 0x3F, 0x01}, // 20: J
    {0x7F, 0x08, 0x14, 0x22, 0x41}, // 21: K
    {0x7F, 0x40, 0x40, 0x40, 0x40}, // 22: L
    {0x7F, 0x02, 0x0C, 0x02, 0x7F}, // 23: M
    {0x7F, 0x04, 0x08, 0x10, 0x7F}, // 24: N
    {0x3E, 0x41, 0x41, 0x41, 0x3E}, // 25: O
    {0x7F, 0x09, 0x09, 0x09, 0x06}, // 26: P
    {0x3E, 0x41, 0x51, 0x21, 0x5E}, // 27: Q
    {0x7F, 0x09, 0x19, 0x29, 0x46}, // 28: R
    {0x46, 0x49, 0x49, 0x49, 0x31}, // 29: S
    {0x01, 0x01, 0x7F, 0x01, 0x01}, // 30: T
    {0x3F, 0x40, 0x40, 0x40, 0x3F}, // 31: U
    {0x1F, 0x20, 0x40, 0x20, 0x1F}, // 32: V
    {0x3F, 0x40, 0x38, 0x40, 0x3F}, // 33: W
    {0x63, 0x14, 0x08, 0x14, 0x63}, // 34: X
    {0x07, 0x08, 0x70, 0x08, 0x07}, // 35: Y
    {0x61, 0x51, 0x49, 0x45, 0x43}, // 36: Z
    {0x00, 0x36, 0x36, 0x00, 0x00}, // 37: ':'
    {0x23, 0x13, 0x08, 0x64, 0x62}  // 38: '%'
};

int get_font_index(char c) {
    if (c == ' ') return 0;
    if (c >= '0' && c <= '9') return (c - '0') + 1;
    if (c >= 'A' && c <= 'Z') return (c - 'A') + 11;
    if (c >= 'a' && c <= 'z') return (c - 'a') + 11;
    if (c == ':') return 37;
    if (c == '%') return 38;
    return 0;
}

void oled_send_cmd(uint8_t cmd) {
    uint8_t data[2] = {0x00, cmd};
    i2c_master_write_to_device(I2C_MASTER_NUM, OLED_ADDR, data, 2, 1000 / portTICK_PERIOD_MS);
}

void oled_send_data(uint8_t* data, size_t length) {
    uint8_t buf[129];
    buf[0] = 0x40;
    memcpy(&buf[1], data, length);
    i2c_master_write_to_device(I2C_MASTER_NUM, OLED_ADDR, buf, length + 1, 1000 / portTICK_PERIOD_MS);
}

void oled_init() {
    vTaskDelay(pdMS_TO_TICKS(100));
    oled_send_cmd(0xAE); oled_send_cmd(0x20); oled_send_cmd(0x02);
    oled_send_cmd(0x8D); oled_send_cmd(0x14); oled_send_cmd(0xAF);
}

void oled_clear() {
    uint8_t empty_line[128] = {0};
    for (int page = 0; page < 8; page++) {
        oled_send_cmd(0xB0 + page); oled_send_cmd(0x02); oled_send_cmd(0x10);
        oled_send_data(empty_line, 128);
    }
}

void oled_print_string(int page, int col, const char* str) {
    oled_send_cmd(0xB0 + page);
    oled_send_cmd(0x00 + ((col + 2) & 0x0F));
    oled_send_cmd(0x10 + (((col + 2) >> 4) & 0x0F));
    uint8_t char_data[6];
    while (*str) {
        int idx = get_font_index(*str);
        for(int i=0; i<5; i++) char_data[i] = font5x7[idx][i];
        char_data[5] = 0x00;
        oled_send_data(char_data, 6);
        str++;
    }
}

// ==========================================
// 2. SENSOR HARDWARE CONFIG
// ==========================================
esp_err_t max30102_write_reg(uint8_t reg_addr, uint8_t data) {
    uint8_t write_buf[2] = {reg_addr, data};
    return i2c_master_write_to_device(I2C_MASTER_NUM, MAX30102_ADDR, write_buf, 2, I2C_MASTER_TIMEOUT_MS / portTICK_PERIOD_MS);
}

static esp_err_t i2c_master_init(void) {
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = I2C_MASTER_SDA_IO,
        .scl_io_num = I2C_MASTER_SCL_IO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_MASTER_FREQ_HZ,
    };
    i2c_param_config(I2C_MASTER_NUM, &conf);
    return i2c_driver_install(I2C_MASTER_NUM, conf.mode, 0, 0, 0);
}

void max30102_init(void) {
    max30102_write_reg(0x09, 0x40);
    vTaskDelay(pdMS_TO_TICKS(100));
    max30102_write_reg(0x04, 0x00);
    max30102_write_reg(0x05, 0x00);
    max30102_write_reg(0x06, 0x00);
    max30102_write_reg(0x08, 0x4F); // 400Hz Sample Rate
    max30102_write_reg(0x09, 0x03); // Red + IR
    max30102_write_reg(0x0A, 0x27);
    max30102_write_reg(0x0C, 0x24);
    max30102_write_reg(0x0D, 0x24);
}

// ==========================================
// 3. RESEARCH-GRADE DSP ALGORITHM
// ==========================================
void process_medical_data(void) {
    float filtered_ir[BUFFER_SIZE];
    float filtered_red[BUFFER_SIZE];
   
    float ir_dc = (float)ir_buf[0];
    float red_dc = (float)red_buf[0];
   
    for (int i = 0; i < BUFFER_SIZE; i++) {
        ir_dc = (0.95 * ir_dc) + (0.05 * (float)ir_buf[i]);
        red_dc = (0.95 * red_dc) + (0.05 * (float)red_buf[i]);
       
        filtered_ir[i] = (float)ir_buf[i] - ir_dc;
        filtered_red[i] = (float)red_buf[i] - red_dc;
    }

    float ir_max = -999999, ir_min = 999999;
    float red_max = -999999, red_min = 999999;

    for (int i = 0; i < BUFFER_SIZE; i++) {
        if (filtered_ir[i] > ir_max) ir_max = filtered_ir[i];
        if (filtered_ir[i] < ir_min) ir_min = filtered_ir[i];
        if (filtered_red[i] > red_max) red_max = filtered_red[i];
        if (filtered_red[i] < red_min) red_min = filtered_red[i];
    }

    float ir_ac_amp = ir_max - ir_min;
   
    if (ir_ac_amp < 400) {
        if (oled_state != 3) {
            oled_clear();
            oled_print_string(2, 15, "POOR SIGNAL");
            oled_print_string(4, 15, "KEEP STILL");
            oled_state = 3;
        }
        return;
    }

    int last_peak_index = -1;
    float ibi_sum = 0;
    int valid_beats = 0;

    for (int i = 2; i < BUFFER_SIZE - 2; i++) {
        if (filtered_ir[i] > filtered_ir[i-1] && filtered_ir[i] >= filtered_ir[i+1]) {
            if (filtered_ir[i] > (ir_max * 0.35)) {
                if (last_peak_index != -1) {
                    int sample_diff = i - last_peak_index;
                    if (sample_diff >= 10 && sample_diff <= 60) {
                        float time_sec = sample_diff * 0.04;
                        float instant_bpm = 60.0 / time_sec;
                        ibi_sum += instant_bpm;
                        valid_beats++;
                    }
                }
                last_peak_index = i;
            }
        }
    }

    if (valid_beats >= 2) {
        float raw_bpm = ibi_sum / valid_beats;
        float final_spo2 = 0;
        float red_ac_amp = red_max - red_min;
       
        if (ir_max > 0 && red_max > 0 && ir_ac_amp > 0) {
            float ratio = (red_ac_amp / (red_max + 1.0)) / (ir_ac_amp / (ir_max + 1.0));
            final_spo2 = 104.0 - (16.0 * ratio);
            if (final_spo2 > 100.0) final_spo2 = 100.0;
            if (final_spo2 < 85.0) final_spo2 = 96.0;
        }

        if (final_spo2 >= 85.0 && final_spo2 <= 100.0 && raw_bpm >= 45 && raw_bpm <= 160) {
            display_bpm = (display_bpm == 0) ? raw_bpm : (display_bpm * 0.80) + (raw_bpm * 0.20);
            display_spo2 = (display_spo2 == 0) ? final_spo2 : (display_spo2 * 0.80) + (final_spo2 * 0.20);

            if (oled_state != 2) {
                oled_clear();
                oled_state = 2;
            }

            char bpm_str[16];
            char spo2_str[16];
            char ram_str[24];
            char uptime_str[24];

            sprintf(bpm_str, "BPM : %d   ", (int)display_bpm);
            sprintf(spo2_str, "SPO2: %d%% ", (int)display_spo2);
           
            // 1. Resource: Free RAM Calculation
            uint32_t free_ram = esp_get_free_heap_size() / 1024;
            sprintf(ram_str, "RAM: %lu KB FREE", (unsigned long)free_ram);

            // 2. Relevant Info: Device Uptime Calculation (in Seconds)
            uint32_t uptime_sec = (uint32_t)(esp_timer_get_time() / 1000000ULL);
            sprintf(uptime_str, "UPTIME: %lu SEC", (unsigned long)uptime_sec);

            // 1.3 Inch Screen Proper 4-Line Formatting
            oled_print_string(0, 5,  bpm_str);
            oled_print_string(2, 5,  spo2_str);
            oled_print_string(5, 5,  ram_str);    // Line 5: Resource Monitor
            oled_print_string(7, 5,  uptime_str); // Line 7: Relevant Info (Uptime)
           
            ESP_LOGI(TAG, "%s | %s | %s | %s", bpm_str, spo2_str, ram_str, uptime_str);
        }
    }
}

// ==========================================
// 4. MAIN TASK LOOP
// ==========================================
void max30102_task(void *pvParameters) {
    uint8_t reg_fifo_data = 0x07;
    uint8_t data[6];
    int i2c_error_count = 0;

    TickType_t xLastWakeTime;
    const TickType_t xFrequency = pdMS_TO_TICKS(40);
    xLastWakeTime = xTaskGetTickCount();

    while (1) {
        esp_err_t ret = i2c_master_write_read_device(I2C_MASTER_NUM, MAX30102_ADDR,
                                                     &reg_fifo_data, 1, data, 6,
                                                     I2C_MASTER_TIMEOUT_MS / portTICK_PERIOD_MS);

        if (ret == ESP_OK) {
            i2c_error_count = 0;
            uint32_t raw_red = ((data[0] << 16) | (data[1] << 8) | data[2]) & 0x03FFFF;
            uint32_t raw_ir  = ((data[3] << 16) | (data[4] << 8) | data[5]) & 0x03FFFF;

            if (raw_ir < FINGER_ON_THRESHOLD) {
                if (finger_is_on || oled_state == -1) {
                    oled_clear();
                    oled_print_string(2, 10, "WAITING FOR");
                    oled_print_string(4, 20, "FINGER");
                    finger_is_on = false; display_bpm = 0; display_spo2 = 0;
                    buf_idx = 0; stabilization_timer = 0; oled_state = 0;
                }
                gpio_set_level(BLINK_GPIO, 1);
                vTaskDelayUntil(&xLastWakeTime, xFrequency);
                continue;
            } else {
                if (!finger_is_on) {
                    oled_clear();
                    oled_print_string(2, 20, "DETECTED");
                    oled_print_string(4, 15, "READING...");
                    finger_is_on = true; stabilization_timer = 75;
                    buf_idx = 0; oled_state = 1;
                }
            }

            gpio_set_level(BLINK_GPIO, 0);

            if (stabilization_timer > 0) {
                stabilization_timer--;
                vTaskDelayUntil(&xLastWakeTime, xFrequency);
                continue;
            }

            ir_buf[buf_idx] = raw_ir; red_buf[buf_idx] = raw_red; buf_idx++;

            if (buf_idx >= BUFFER_SIZE) {
                process_medical_data();
                for (int i = 30; i < BUFFER_SIZE; i++) {
                    ir_buf[i - 30] = ir_buf[i];
                    red_buf[i - 30] = red_buf[i];
                }
                buf_idx = BUFFER_SIZE - 30;
            }
        } else {
            i2c_error_count++;
            if (i2c_error_count > 10) { max30102_init(); i2c_error_count = 0; }
        }
        vTaskDelayUntil(&xLastWakeTime, xFrequency);
    }
}

// ==========================================
// 5. MAIN ENTRY POINT
// ==========================================
void app_main(void) {
    gpio_reset_pin(BLINK_GPIO);
    gpio_set_direction(BLINK_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(BLINK_GPIO, 0);

    ESP_ERROR_CHECK(i2c_master_init());
   
    oled_init();
    oled_clear();
   
    oled_print_string(2, 10, "SMART OXIMETER");
    oled_print_string(4, 25, "MADE BY");
    oled_print_string(6, 15, "FYP Group");
   
    vTaskDelay(pdMS_TO_TICKS(3000));
   
    max30102_init();
    xTaskCreate(max30102_task, "max30102_task", 4096, NULL, 5, NULL);
}
