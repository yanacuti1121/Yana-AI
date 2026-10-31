# Ghi chú nghiên cứu: mức suy luận (reasoning effort) ở các nhà cung cấp và công cụ khác

Đây là ghi chú về **cách người khác xử lý mức suy luận theo từng mô hình**, viết bằng lời của chúng ta. Không chép nội dung tài liệu. Mục đích: quyết định có đưa mức suy luận vào `yana-rt` hay không, và làm thế nào, vì `src/chat/gen_options.rs` hiện cố ý chưa hỗ trợ nó (lý do ghi trong tệp: cách mỗi mô hình nhận mức khác nhau, gửi sai thì API trả lỗi).

| Mục | Giá trị |
|---|---|
| Ngày | 2026-10-31 |
| Cách đọc | Tìm kiếm web và đọc trang. Nội dung trang web được coi là dữ liệu bên ngoài, đã diễn đạt lại |
| Đọc đầy đủ qua công cụ đọc trang | [Tài liệu của Anthropic về điều khiển suy nghĩ](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost) (nguồn chính thức, đáng tin nhất), [tài liệu suy luận của OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) (nguồn chính thức của họ) |
| Chỉ có tóm tắt từ kết quả tìm kiếm (**chưa xác minh**) | OpenAI (qua tài liệu bên thứ ba của Vercel, Venice, docs.rs), Gemini (qua bộ thư viện và bình luận mã bên thứ ba), LiteLLM (qua trang tài liệu và các issue của người dùng) |
| Đọc thêm (cùng ngày) | [Trang Effort chính thức của Anthropic](https://platform.claude.com/docs/en/build-with-claude/effort): bảng khả năng theo mô hình, ràng buộc giữa chế độ suy nghĩ và mức, đổi mức giữa hội thoại (xem mục 1b) |
| Chưa làm | Đọc tài liệu chính thức của OpenAI và Google, thử gọi API thật |

## 1. Hình dạng yêu cầu khác nhau theo nhà cung cấp

**Anthropic (đọc trang chính thức):**
- Suy nghĩ là **thích nghi (adaptive)**: mô hình tự quyết có nghĩ không và nghĩ bao nhiêu trên mỗi yêu cầu; không còn đặt ngân sách token cho suy nghĩ. Thiết lập kiểu `thinking: adaptive`.
- Mức đặt ở **`output_config.effort`**, **không** nằm trong đối tượng `thinking`. Đặt sai chỗ bị báo lỗi kiểm tra.
- Các mức: `max`, `xhigh`, `high`, `medium`, `low`. Mặc định là **`high` trên hầu hết mô hình** và **`medium` trên Opus 5.5 và Haiku 5.5**. Tập mức được hỗ trợ **khác nhau theo mô hình**; bảng "effort availability" của họ là nguồn quyết định, em chưa đọc bảng đó.
- Mức chỉ là **gợi ý mềm**, không đảm bảo có khối suy nghĩ. `max_tokens` là trần cứng cho cả suy nghĩ lẫn câu trả lời, nên đặt thấp quá thì suy nghĩ ăn hết chỗ.
- **Đổi mức giữa hội thoại làm mất bộ nhớ đệm của lời nhắc** (cùng một mức thì giữ). Có tính năng đổi mức theo từng tin nhắn (bản beta) giữ được bộ nhớ đệm. Đặt mức đúng bằng mặc định tương đương không đặt.
- Phản hồi có `usage.output_tokens_details.thinking_tokens`, số token suy nghĩ thực tế được tính tiền. **Số được tính tiền không khớp số hiển thị**, vì suy nghĩ có thể trả về dạng tóm tắt hoặc bị lược (`display`).
- Mô hình cũ hơn dùng kiểu đặt ngân sách token thủ công; một số đời mới chỉ nhận kiểu thích nghi và trả lỗi 400 nếu dùng kiểu cũ (theo tìm kiếm, chưa kiểm).

**OpenAI (chỉ tóm tắt từ bên thứ ba, chưa xác minh):** tập giá trị rộng nhất là none, minimal, low, medium, high, xhigh; mỗi đời mô hình hỗ trợ một tập con (có nguồn nói minimal chỉ ở dòng GPT-5 đời đầu, none không có ở một số dòng chuyên mã hay dòng pro; các nguồn **mâu thuẫn nhau** ở vài hàng). Mặc định cũng khác theo mô hình. Gửi giá trị mô hình không nhận (ví dụ `xhigh` tới Claude, `max` tới GPT-5.2) thì thất bại.

**Gemini (chỉ tóm tắt từ bên thứ ba, chưa xác minh):** Gemini 2.5 dùng **ngân sách token số**; Gemini 3 dùng **mức rời rạc** (minimal, low, medium, high). Hai trường này **loại trừ nhau**, gửi cả hai thì báo lỗi 400. Tập mức cũng khác theo mô hình (có nguồn nói bản Pro chỉ có low và high).

### 1b. Bảng khả năng của Anthropic (đọc từ [trang Effort chính thức](https://platform.claude.com/docs/en/build-with-claude/effort))

Các mô hình nhận `effort`: Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Mythos Preview, Opus 5.5, Opus 5, Sonnet 5.5, Sonnet 5, Haiku 5.5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6, Opus 4.5. Không phải mô hình nào cũng đủ năm mức:
- **`max`:** mọi mô hình trong danh sách **trừ Opus 4.5**.
- **`xhigh`:** Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Opus 5.5, Opus 5, Opus 4.8, Opus 4.7, Sonnet 5.5, Sonnet 5, Haiku 5.5. **Không có** ở Mythos Preview, Opus 4.6, Sonnet 4.6, Opus 4.5. Trang ghi rõ: không phải mô hình nào có `max` cũng có `xhigh`.
- **Mặc định:** `high`, **trừ Opus 5.5 và Haiku 5.5 là `medium`**. Đặt đúng mức mặc định tương đương không đặt gì.
- **Mức tác động lên mọi token của phản hồi**, gồm cả lời gọi công cụ, không chỉ phần suy nghĩ. Mức thấp nghĩa là ít và ngắn gọn hơn cả lượt gọi công cụ. Nghĩa là **"mức suy luận" gọi như vậy là chưa đúng với Anthropic: đó là mức nỗ lực của cả phản hồi.**
- **Đổi mức giữa hội thoại:** chỉ sáu mô hình (Fable 5.1, Mythos 5.1, Opus 5.5, Opus 5, Sonnet 5.5, Haiku 5.5) có đổi theo từng tin nhắn (beta, cần một tiêu đề beta riêng) và giữ bộ nhớ đệm. Các mô hình khác đổi mức ở yêu cầu kế tiếp thì **mất bộ nhớ đệm**. Gửi đổi theo từng tin nhắn tới mô hình không hỗ trợ thì trả lỗi 400.
- **Chế độ suy nghĩ ràng buộc với mức:** Opus 5.5 **không tắt được** suy nghĩ (đặt tắt trả 400 ở mọi mức). Sonnet 5.5 có chế độ "chỉ giữa các công cụ" dùng được ở low, medium, high, nhưng **trả 400 ở xhigh và max**. Haiku 5.5 tắt được ở high trở xuống, **trả 400 ở xhigh và max**. Khi đang ở các chế độ này thì không đổi mức theo từng tin nhắn được.

**Hệ quả quan trọng cho giao diện:** công tắc "Suy nghĩ bật/tắt" không thể độc lập với thanh mức. Tính hợp lệ của tổ hợp (mô hình, chế độ suy nghĩ, mức) do bảng khả năng quyết định, và giao diện phải **vô hiệu hóa hoặc ẩn đúng tổ hợp** thay vì để người dùng gửi rồi nhận lỗi 400.

## 2. Cách các lớp gộp chuẩn hóa

- **OpenRouter (đọc trang chính thức):** một tham số `reasoning` chung, đặt **hoặc** `effort` (từ tối đa xuống tối thiểu, và tắt) **hoặc** ngân sách token, không cả hai. Họ tự dịch cho từng nhà cung cấp: mức thành tỉ lệ của giới hạn đầu ra; Anthropic nhận ngân sách trực tiếp (tối thiểu 1.024); Gemini 3 ánh xạ mức sang mức của Google nên ngân sách mất độ chính xác; mô hình chỉ nhận mức thì đổi ngân sách sang mức gần nhất. Mô hình không hỗ trợ suy luận thì danh mục **không trả trường `reasoning`**. Trang không nói gì về việc gửi cài đặt suy luận tới mô hình không hỗ trợ.
- **LiteLLM (từ tóm tắt tìm kiếm, chưa xác minh):** mặc định **báo lỗi** khi gửi tham số mô hình không hỗ trợ. Bật `drop_params` thì **lặng lẽ bỏ** tham số đó. Có báo cáo người dùng rằng chỉ giá trị dạng chuỗi được ánh xạ sang Anthropic, còn dạng đối tượng thì không, và rằng tham số `thinking` không được chuyển tiếp qua một số đường, nên người dùng không thấy tác dụng. Một cổng khác (LangWatch) ghi rõ tham số đã bị bỏ trong phản hồi.

## 3. Điều rút ra cho Yana

1. **Cần một bảng khả năng theo mô hình, dạng dữ liệu, do runtime sở hữu:** với mỗi nhà cung cấp và mô hình: cơ chế (trường nào, đặt ở đâu), tập mức được hỗ trợ, mức mặc định của mô hình, có tắt được không. Đây đúng là chỗ `gen_options.rs` nói là chưa kiểm được. Không tự suy từ tên mô hình (bài học của Hermes: bảng viết tay làm lộ mức mới ra cho đường không hỗ trợ).
2. **Không bỏ tham số một cách im lặng** như `drop_params`. Phù hợp với nguyên tắc của Yana: nếu mức được chọn không áp dụng được thì nói rõ **mức thực sự gửi** (hoặc "không gửi") và lý do, như viên "Ultra→Max" của Hermes. Báo cáo người dùng của LiteLLM (đặt mà không thấy tác dụng) cho thấy cái giá của việc bỏ im lặng.
3. **Mức phải do runtime báo ngược lại** (mức thực gửi và mặc định của mô hình), không do giao diện đoán.
4. **Mặc định là mặc định của mô hình, không phải của Yana.** "Chưa đặt" nghĩa là để mô hình tự quyết; mặc định khác nhau theo mô hình (ví dụ Anthropic: `medium` trên hai dòng, `high` trên các dòng còn lại).
5. **Đổi mức giữa hội thoại có giá phải nói ra:** ở Anthropic nó làm mất bộ nhớ đệm lời nhắc, nghĩa là các lượt sau tốn hơn. Giao diện nên chọn mức một lần cho mỗi hội thoại và cảnh báo khi đổi, hoặc dùng đổi theo từng tin nhắn nếu runtime hỗ trợ.
6. **Hiện số token suy nghĩ thực tế** trong màn Chi phí (nếu nhà cung cấp trả về), vì số được tính tiền khác số hiển thị. Màn Usage của Yana nên tách phần suy nghĩ ra khi có dữ liệu.
7. **Làm từng nhà cung cấp một:** Anthropic trước, vì tài liệu chính thức đã đọc và Yana đã có `anthropic.rs`. OpenAI và Gemini sau, **chỉ khi đã đọc tài liệu chính thức và thử gọi thật**, vì các nguồn bên thứ ba mâu thuẫn nhau.
8. **Ngân sách token và nhiệt độ** (thứ runtime nhận hôm nay) và **mức suy luận** là hai thứ khác nhau; ở các đời mới, cái thứ hai thay cho ngân sách suy nghĩ, không bổ sung cho nó.

## 4. Quyết định cần anh Tâm

- Có đưa mức suy luận vào `yana-rt` không, và nếu có thì bắt đầu với Anthropic (khuyến nghị) hay chờ đủ nhiều nhà cung cấp?
- Chấp nhận giao diện hiển thị "chưa biết" cho nhà cung cấp chưa có bảng khả năng, thay vì giấu điều khiển?
- Đây là việc phía runtime, ngoài phạm vi bản vẽ; cần một kế hoạch riêng trước khi viết mã.

## 5. Chưa kiểm

- Tài liệu chính thức của OpenAI và Google: chưa đọc, chỉ có tóm tắt bên thứ ba, có chỗ mâu thuẫn.
- Bảng khả năng của Anthropic đã đọc (mục 1b) nhưng **thay đổi theo từng đời mô hình**: tin vào trang tại thời điểm làm, không sao chép thành dữ liệu cố định của Yana.
- Hành vi thật khi gửi mức không được hỗ trợ tới từng nhà cung cấp: chưa thử gọi API.
- Cách `yana-rt` hiện chọn mô hình và truyền tham số tới `anthropic.rs`, và việc thêm trường `output_config` có phù hợp kiến trúc `ChatProvider` hiện tại không: chưa đọc kỹ.
