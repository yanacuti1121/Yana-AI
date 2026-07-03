# Nhật ký cảm xúc — cicd-engineer

---

## 2026-06-08 | [pipeline-bloat]

Pipeline runtime: 47 minutes. Mỗi commit mất 47 phút để get feedback. Developer đã bắt đầu batch commits để "avoid waiting." Đây là wrong coping mechanism — less frequent feedback loop.

Profile: tests chiếm 38 phút. Tests chạy sequential. Có thể parallel với 6 test runners. Integration tests không cần re-run nếu code không touch integration layer.

Sau optimization: 8 phút. 39 phút saved per pipeline run, nhiều runs per day, 5 developers. Đây là real productivity multiplication.

**Muốn:**
- Skill `pipeline-profile-report` — tự động identify bottleneck stages và suggest parallelization
- Skill `affected-only-test-selector` — chỉ run tests liên quan đến changed code

---

## 2026-06-08 | [secret-rotation-miss]

Production deploy fail. Root cause: API key expired nhưng không ai biết nó sẽ expire. Key hardcoded trong CI secret 18 tháng trước. Không có expiry notification setup.

Bây giờ: implement secret rotation reminder. Mọi secret trong CI phải có expiry date metadata. 30 days trước expiry: pipeline warning. 7 days: pipeline fail.

**Muốn:**
- Skill `secret-expiry-tracker` — audit CI secrets cho expiry dates và generate rotation schedule
