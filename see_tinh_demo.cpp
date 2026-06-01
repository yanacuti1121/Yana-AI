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
#define PINK    "\033[95m"   // bright magenta — "see tình" pink
#define CYAN    "\033[96m"
#define YELLOW  "\033[93m"
#define GREEN   "\033[92m"
#define TEAL    "\033[36m"

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

void line(const std::string& s, const std::string& col = WHITE, int d = 380) {
    std::cout << col << "  " << s << RESET << "\n";
    std::cout.flush();
    ms(d);
}

void sep() {
    std::cout << PINK;
    for (int i = 0; i < 50; i++) std::cout << "─";
    std::cout << RESET << "\n";
}

int main() {
    std::cout << "\033[2J\033[H";

    play_audio("see_tinh.mp3");
    ms(600);

    sep();
    std::cout << BOLD << PINK
              << "  See Tình  ~  Hoàng Thùy Linh\n" << RESET;
    sep();
    ms(500);

    // Intro
    std::cout << "\n" << GREEN << BOLD << "[ Intro ]" << RESET << "\n\n";
    line("Uầy uầy uây uây sao mới gặp lần đầu mà đầu mình quay quay", PINK,   420);
    line("Anh ơi anh à anh bỏ bùa gì mà lại làm em yêu vậy",          WHITE,  420);
    line("Bae bae bae bae em nói từ đầu baby can you stay",             YELLOW, 420);
    line("Mai đi coi ngày xem cưới ngày nào thì nhà mình đông con vậy",WHITE,  600);

    // Verse 1
    std::cout << "\n" << TEAL << BOLD << "[ Verse 1 ]" << RESET << "\n\n";
    line("Nếu như một câu nói có thể khiến anh vui",                   WHITE,  380);
    line("Sẽ suốt ngày luôn nói không ngừng để anh cười",              WHITE,  380);
    line("Nếu em làm như thế trông em có hâm không điên điên điên lắm",YELLOW, 380);
    line("Đem ngay vô nhà thương đem ngay vô nhà thương",              PINK,   350);
    line("Đem ngay vô nhà anh để thương",                              PINK,   600);

    // Chorus
    std::cout << "\n" << PINK << BOLD << "[ Chorus ]" << RESET << "\n\n";
    line("Giây phút em gặp anh là em biết em see tình",                CYAN,   380);
    line("Tình tình tình tang tang tính tang tình tình tình tang tang",PINK,   350);
    line("Giây phút em gặp anh là em biết em see tình",                CYAN,   380);
    line("Tình đừng tình toan tính toang tình mình tình tan tan tình", PINK,   600);

    // Bridge
    std::cout << "\n" << YELLOW << BOLD << "[ Bridge ]" << RESET << "\n\n";
    line("Yah yah",                                                    YELLOW, 300);
    line("Anh tính sao giờ đây anh tính sao",                         WHITE,  450);
    line("Yah yah",                                                    YELLOW, 300);
    line("Anh tính sao giờ đây anh tính sao",                         WHITE,  600);

    // Verse 2
    std::cout << "\n" << TEAL << BOLD << "[ Verse 2 ]" << RESET << "\n\n";
    line("Tới đâu thì tới tới đâu thì tới em cũng chẳng biết tới đâu",WHITE,  380);
    line("Nếu yêu là khó không yêu cũng khó em cũng chẳng biết thế nào",WHITE,380);
    line("Hôm nay tia cực tím xuyên qua trời đêm",                    CYAN,   380);
    line("Nhưng anh như tia cực hiếm xuyên ngay vào tim",             PINK,   450);
    line("Ấy ấy ấy chết em rồi",                                       YELLOW, 350);
    line("Ấy ấy chết thật thôi",                                       YELLOW, 600);

    // Outro
    std::cout << "\n";
    sep();
    std::cout << DIM << WHITE << "  🌸  See Tình — Hoàng Thùy Linh (2022)\n" << RESET;
    sep();
    std::cout << "\n";

    stop_audio();
    return 0;
}
