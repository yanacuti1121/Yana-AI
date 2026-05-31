#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <thread>

#define RESET   "\033[0m"
#define BOLD    "\033[1m"
#define DIM     "\033[2m"
#define CYAN    "\033[36m"
#define YELLOW  "\033[33m"
#define WHITE   "\033[97m"
#define MAGENTA "\033[35m"
#define GREEN   "\033[32m"

void sleep_ms(int ms) {
    std::this_thread::sleep_for(std::chrono::milliseconds(ms));
}

void print_line(const std::string& line, const std::string& color = WHITE, int delay = 380) {
    std::cout << color << "  " << line << RESET << "\n";
    std::cout.flush();
    sleep_ms(delay);
}

void print_sep() {
    std::cout << CYAN;
    for (int i = 0; i < 48; i++) std::cout << "═";
    std::cout << RESET << "\n";
}

int main() {
    std::cout << "\033[2J\033[H"; // clear screen

    print_sep();
    std::cout << BOLD << CYAN
              << "  Come My Way  ~  Sơn Tùng M-TP x Tyga\n" << RESET;
    print_sep();
    sleep_ms(600);

    // Intro
    std::cout << "\n" << MAGENTA << BOLD << "[ Intro: Tyga ]" << RESET << "\n\n";
    print_line("Yeah",       MAGENTA, 500);
    print_line("T-Raww",     MAGENTA, 500);
    print_line("Sơn, M-TP",  MAGENTA, 700);

    // Verse 1 — chỉ 3 dòng đã viral khắp nơi (thấy trên thumbnail video)
    std::cout << "\n" << GREEN << BOLD << "[ Verse 1: Sơn Tùng M-TP ]" << RESET << "\n\n";
    print_line("Baby, come near me now",                    WHITE,  400);
    print_line("You see, this your love, don tie me down",  WHITE,  400);
    print_line("Call me your prisoner",                     YELLOW, 500);

    // Gợi ý điền tiếp
    std::cout << "\n" << DIM << WHITE
              << "  [ ... điền tiếp lời vào đây ... ]\n" << RESET;

    // Outro
    std::cout << "\n";
    print_sep();
    std::cout << DIM << WHITE << "  🎵  Come My Way — TNOA (2022)\n" << RESET;
    print_sep();
    std::cout << "\n";

    return 0;
}
