#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include <unistd.h>
#include <sys/wait.h>
#include <csignal>

#define RESET   "\033[0m"
#define BOLD    "\033[1m"
#define DIM     "\033[2m"
#define WHITE   "\033[97m"
#define TEAL    "\033[96m"
#define YELLOW  "\033[93m"
#define PURPLE  "\033[95m"
#define BLUE    "\033[94m"
#define GREEN   "\033[92m"

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
    if (audio_pid > 0) { kill(audio_pid, SIGTERM); waitpid(audio_pid, nullptr, 0); audio_pid = -1; }
}

void ms(int n) { std::this_thread::sleep_for(std::chrono::milliseconds(n)); }

void line(const std::string& s, const std::string& col = WHITE, int d = 400) {
    std::cout << col << "  " << s << RESET << "\n";
    std::cout.flush();
    ms(d);
}

void sep() {
    std::cout << TEAL;
    for (int i = 0; i < 50; i++) std::cout << "─";
    std::cout << RESET << "\n";
}

int main() {
    std::cout << "\033[2J\033[H";
    play_audio("son_thuy_trung_may.mp3");
    ms(600);

    sep();
    std::cout << BOLD << TEAL << "  Sơn Thủy Trùng Mây  ~  Buitruonglinh\n" << RESET;
    sep();
    ms(500);

    // Verse 1
    std::cout << "\n" << GREEN << BOLD << "[ Verse 1 ]" << RESET << "\n\n";
    line("Tựa hoa rơi bên thềm ta chìm trong cô liêu",         TEAL,   420);
    line("Sông vắng tiêu điều mình ta",                        WHITE,  420);
    line("Chẳng trách người quá vô tình xin đừng đi đừng đi",  PURPLE, 420);
    line("Vạn lí hoá chia ly vì ai",                           WHITE,  600);

    // Pre-Chorus
    std::cout << "\n" << PURPLE << BOLD << "[ Pre-Chorus ]" << RESET << "\n\n";
    line("Lệ hoen bờ mi vì sao cớ sao đành quên câu thề",     PURPLE, 420);
    line("Để mình tôi trên lối mối duyên không thành",         WHITE,  420);
    line("Liệu hoa nào không hương sắc chẳng vương giọt sương",TEAL,   420);
    line("Tình nào không vội vàng ngang trái mãi chẳng vỡ tan",WHITE,  600);

    // Chorus
    std::cout << "\n" << YELLOW << BOLD << "[ Chorus ]" << RESET << "\n\n";
    line("Ngày nào mơ ước một ngày sơn thuỷ trùng mây",        YELLOW, 420);
    line("Ngày ta hạnh phúc bên đời",                          WHITE,  420);
    line("Ngày hoàng hôn trải khắp vạn hướng trùng dương",     YELLOW, 420);
    line("Nối hai phương trời",                                WHITE,  420);
    line("Sợi tình duyên ấy bây giờ chẳng thấy còn đây",       TEAL,   420);
    line("Mỗi chiếc son gió không màu",                        WHITE,  420);
    line("Tình muôn kiếp từ nay về sau",                        YELLOW, 420);
    line("Làm sao biết tìm được nhau",                         WHITE,  600);

    // Bridge
    std::cout << "\n" << BLUE << BOLD << "[ Bridge ]" << RESET << "\n\n";
    line("Nợ tiền có trả là xong",                              WHITE,  380);
    line("Nợ tình mắt chảy thành dòng",                        PURPLE, 380);
    line("Bỏ thì thương mà vương thì tội",                      WHITE,  380);
    line("Anh sợ em khổ mà thôi",                               TEAL,   380);
    line("Đã là của nhau đánh mất nhau làm sao thấu",           WHITE,  380);
    line("Mang người thương về đây được không",                  YELLOW, 380);
    line("Anh chờ em ngày sau về đâu",                          WHITE,  380);
    line("Ngồi đây nhìn mây chờ em được không",                 TEAL,   600);

    // Verse 2
    std::cout << "\n" << GREEN << BOLD << "[ Verse 2 ]" << RESET << "\n\n";
    line("Nhưng mà chưa — mây vẫn trôi lang thang trong chiều mưa", WHITE, 420);
    line("Theo giấc mơ em đi không về nữa",                     PURPLE, 420);
    line("Yêu nhau như họa lí, điêu ngoa như họa kỳ",           TEAL,   420);
    line("Lòng người giờ như ngạ quỷ",                          WHITE,  600);

    // Pre-Chorus repeat
    std::cout << "\n" << PURPLE << BOLD << "[ Pre-Chorus ]" << RESET << "\n\n";
    line("Lệ hoen bờ mi vì sao cớ sao đành quên câu thề",     PURPLE, 420);
    line("Để mình tôi trên lối mối duyên không thành",         WHITE,  420);
    line("Liệu hoa nào không hương sắc chẳng vương giọt sương",TEAL,   420);
    line("Tình nào không vội vàng ngang trái mãi chẳng vỡ tan",WHITE,  600);

    // Chorus x2
    std::cout << "\n" << YELLOW << BOLD << "[ Chorus ]" << RESET << "\n\n";
    line("Ngày nào mơ ước một ngày sơn thuỷ trùng mây",        YELLOW, 420);
    line("Ngày ta hạnh phúc bên đời",                          WHITE,  420);
    line("Ngày hoàng hôn trải khắp vạn hướng trùng dương",     YELLOW, 420);
    line("Sợi tình duyên ấy bây giờ chẳng thấy còn đây",       TEAL,   420);
    line("Tình muôn kiếp từ nay về sau làm sao biết tìm được nhau", WHITE, 600);

    // Outro
    std::cout << "\n" << TEAL << BOLD << "[ Outro ]" << RESET << "\n\n";
    line("Rồi mưa giông đến đây thiếu vắng một bóng hình không phai", WHITE, 420);
    line("Bàn chân ai đợi ai nghe tiếng khóc trong đêm dài",    PURPLE, 420);
    line("Thuyền qua sông còn ngóng trông",                     WHITE,  420);
    line("Hoá mây ngàn dần tan theo ánh trăng vàng",            YELLOW, 420);
    line("Làm sao quay ngược thời gian",                         WHITE,  420);
    line("Hẹn ngày sơn thuỷ trùng mây",                         YELLOW, 700);

    std::cout << "\n";
    sep();
    std::cout << DIM << WHITE << "  ☁️   Sơn Thủy Trùng Mây — Buitruonglinh (2022)\n" << RESET;
    sep();
    std::cout << "\n";

    stop_audio();
    return 0;
}
