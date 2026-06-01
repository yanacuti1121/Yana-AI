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
#define WHITE   "\033[97m"
#define BLUE    "\033[94m"
#define CYAN    "\033[96m"
#define YELLOW  "\033[93m"
#define GREEN   "\033[92m"
#define MAGENTA "\033[95m"

static pid_t audio_pid = -1;

void play_audio(const char* file) {
    audio_pid = fork();
    if (audio_pid == 0) {
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

void ms(int n) { std::this_thread::sleep_for(std::chrono::milliseconds(n)); }

void line(const std::string& s, const std::string& col = WHITE, int d = 400) {
    std::cout << col << "  " << s << RESET << "\n";
    std::cout.flush();
    ms(d);
}

void sep() {
    std::cout << BLUE;
    for (int i = 0; i < 50; i++) std::cout << "─";
    std::cout << RESET << "\n";
}

int main() {
    std::cout << "\033[2J\033[H";

    play_audio("trot_yeu.mp3");
    ms(600);

    sep();
    std::cout << BOLD << BLUE << "  Trót Yêu  ~  T.R.I\n" << RESET;
    sep();
    ms(500);

    // Verse 1
    std::cout << "\n" << GREEN << BOLD << "[ Verse 1 ]" << RESET << "\n\n";
    line("Có chút bối rối chạm tay anh rồi",        CYAN,    420);
    line("Vì anh đang mơ rất dịu dàng",             WHITE,   420);
    line("Có chút tan vỡ chạm môi anh rồi",         CYAN,    420);
    line("Vì em yêu, chỉ yêu mùa ghé thôi",        WHITE,   420);
    line("Có chút thương nhớ làn môi nhẹ nhàng",    CYAN,    420);
    line("Khi em yên say trong giấc",               WHITE,   420);
    line("Có chút yêu dấu chỉ là mơ mộng thôi",    CYAN,    420);
    line("Vì anh luôn mong được có em",             YELLOW,  600);

    // Chorus
    std::cout << "\n" << BLUE << BOLD << "[ Chorus ]" << RESET << "\n\n";
    line("Người nói yêu anh đi, người nói thương anh đi", BLUE,    380);
    line("Để cho con tim này đừng ngóng trong hao gầy",   WHITE,   380);
    line("Hãy đến bên anh đi để cho tình trọn vẹn chúng ta", CYAN, 380);
    line("Vì nơi con tim này luôn có",                    WHITE,   380);
    line("Tình yêu giấu kín cùng thương nhớ cho em",      YELLOW,  550);
    ms(200);
    line("Người nói yêu anh đi, người nói thương anh đi", BLUE,    380);
    line("Để cho con tim này đừng ngóng trong hao gầy",   WHITE,   380);
    line("Hãy đến bên anh đi để cho tình trọn vẹn chúng ta", CYAN, 380);
    line("Vì nơi con tim này luôn có",                    WHITE,   380);
    line("Tình yêu giấu kín cùng thương nhớ cho em",      YELLOW,  700);

    // Verse 2
    std::cout << "\n" << GREEN << BOLD << "[ Verse 2 ]" << RESET << "\n\n";
    line("Có chút bối rối chạm tay anh rồi",        CYAN,    420);
    line("Vì anh đang mơ rất dịu dàng",             WHITE,   420);
    line("Có chút tan vỡ chạm môi anh rồi",         CYAN,    420);
    line("Vì em yêu chỉ yêu mùa ghé thôi",         WHITE,   420);
    line("Có chút thương nhớ làn môi nhẹ nhàng",    CYAN,    420);
    line("Khi em yên say trong giấc",               WHITE,   420);
    line("Vì có chút yêu dấu chỉ là mơ mộng thôi", CYAN,    420);
    line("Vì anh luôn mong được có em",             YELLOW,  600);

    // Chorus 2
    std::cout << "\n" << BLUE << BOLD << "[ Chorus ]" << RESET << "\n\n";
    line("Người nói yêu anh đi, người nói thương anh đi", BLUE,    380);
    line("Để cho con tim này đừng ngòng trong hao gầy",   WHITE,   380);
    line("Hãy đến bên anh đi để cho tình trọn vẹn chúng ta", CYAN, 380);
    line("Vì nơi con tim này luôn có",                    WHITE,   380);
    line("Tình yêu giấu kín cùng thương nhớ cho em",      YELLOW,  550);
    ms(200);
    line("Người nói yêu anh đi, người nói thương anh đi", BLUE,    380);
    line("Để cho con tim này đừng ngóng trong hao gầy",   WHITE,   380);
    line("Hãy đến bên anh đi để cho tình trọn vẹn chúng ta", CYAN, 380);
    line("Vì nơi con tim này luôn có",                    WHITE,   380);
    line("Tình yêu giấu kín cùng thương nhớ cho em",      YELLOW,  700);

    // Outro
    std::cout << "\n" << MAGENTA << BOLD << "[ Outro ]" << RESET << "\n\n";
    line("Có chút bối rối, có chút tan vỡ",         CYAN,    420);
    line("Có chút thương nhớ tình ai",              WHITE,   420);
    line("Người hỡi, đến bên anh này",              BLUE,    420);
    line("Nói yêu mình anh thôi",                  YELLOW,  420);
    line("Để cho lòng anh thôi nhớ mong",           WHITE,   700);

    std::cout << "\n";
    sep();
    std::cout << DIM << WHITE << "  💙  Trót Yêu — T.R.I\n" << RESET;
    sep();
    std::cout << "\n";

    stop_audio();
    return 0;
}
