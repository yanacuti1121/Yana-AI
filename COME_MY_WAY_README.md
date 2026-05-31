# Come My Way — Terminal Demo

**Sơn Tùng M-TP x Tyga** · TNOA (2022)

Terminal lyrics player viết bằng C++ — hiển thị lời bài hát với màu ANSI + phát nhạc nền.

## Build & chạy

```bash
# Build
g++ -std=c++17 come_my_way_demo.cpp -o come_my_way

# Chạy (cần mpv hoặc ffplay + file come_my_way.mp3 cùng thư mục)
./come_my_way
```

## Yêu cầu

- `mpv` hoặc `ffplay` (để phát nhạc)
- Terminal hỗ trợ ANSI color

```bash
# Ubuntu/Debian
sudo apt install mpv
```
