#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <thread>
#include <unistd.h>
#include <sys/wait.h>
#include <csignal>

#define RESET   "\033[0m"
#define BOLD    "\033[1m"
#define DIM     "\033[2m"
#define CYAN    "\033[36m"
#define YELLOW  "\033[33m"
#define WHITE   "\033[97m"
#define MAGENTA "\033[35m"
#define GREEN   "\033[32m"

static pid_t audio_pid = -1;

void play_audio(const char* file) {
    audio_pid = fork();
    if (audio_pid == 0) {
        // child: thử mpv trước, fallback sang ffplay
        execlp("mpv", "mpv", "--no-video", "--really-quiet", file, nullptr);
        execlp("ffplay", "ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", file, nullptr);
        _exit(1);
    }
}

void stop_audio() {
    if (audio_pid > 0) {
        kill(audio_pid, SIGTERM);
        waitpid(audio_pid, nullptr, 0);
        audio_pid = -1;
    }
}

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

    play_audio("come_my_way.mp3");
    sleep_ms(800); // chờ nhạc khởi động

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

    // Verse 1
    std::cout << "\n" << GREEN << BOLD << "[ Verse 1: Sơn Tùng M-TP ]" << RESET << "\n\n";
    print_line("Baby, come near me now",                         WHITE,  400);
    print_line("You see, this your love, don tie me down",       WHITE,  400);
    print_line("Call me your prisoner",                          YELLOW, 400);
    print_line("I'm jailed in your love, I ain't coming out",    WHITE,  400);
    print_line("Oh, girl, you got all the formula",              WHITE,  400);
    print_line("Make me high like I'm on tequila",               WHITE,  400);
    print_line("Connect like we cellular",                       YELLOW, 400);
    print_line("You enter my medulla",                           WHITE,  600);

    // Pre-Chorus
    std::cout << "\n" << YELLOW << BOLD << "[ Pre-Chorus: Sơn Tùng M-TP ]" << RESET << "\n\n";
    print_line("I wanna take you, buy all the thing you want",   WHITE,  400);
    print_line("Give you all the love you are really worth",     WHITE,  400);
    print_line("Every day, I go shower you with love",           WHITE,  400);
    print_line("Come rain or the shine, I gotcha",               YELLOW, 700);

    // Chorus
    std::cout << "\n" << CYAN << BOLD << "[ Chorus: Sơn Tùng M-TP ]" << RESET << "\n\n";
    print_line("And when you come through my way",               CYAN,   400);
    print_line("Oh, e be like my world dey somersault",          WHITE,  400);
    print_line("When you show my way",                           CYAN,   400);
    print_line("And girl, you don't know how I feel, oh",        WHITE,  500);
    print_line("When you go come my way, way, way",              YELLOW, 350);
    print_line("Come my way, way",                               YELLOW, 350);
    print_line("Baby, don't run away, way, way",                 WHITE,  350);
    print_line("Run away, way",                                  WHITE,  350);
    print_line("Oh, baby, come my way, way, way",                YELLOW, 350);
    print_line("When you go come my way, way",                   YELLOW, 500);
    print_line("Girl, let me show you what I mean 'cause",       WHITE,  400);
    print_line("I do not gamble and e too sure",                 CYAN,   700);

    // Outro
    std::cout << "\n";
    print_sep();
    std::cout << DIM << WHITE << "  🎵  Come My Way — TNOA (2022)\n" << RESET;
    print_sep();
    std::cout << "\n";

    stop_audio();
    return 0;
}
