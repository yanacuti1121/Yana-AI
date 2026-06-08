const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("=== ĐÃ KẾT NỐI VỚI QWEN 3 CODER (WEB STREAM) ===");
console.log("Nhập tin nhắn của bạn (Gõ 'exit' để thoát):\n");

function ask() {
  rl.question('> ', async (input) => {
    if (input.toLowerCase() === 'exit') return rl.close();
    
    try {
      const response = await fetch('http://localhost:20128/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-8a5519a24dcaa639-wg81iw-f5ed5b78'
        },
        body: JSON.stringify({
          model: 'kr/qwen3-coder-next',
          messages: [{ role: 'user', content: input }],
          stream: true
        })
      });

      if (!response.body) {
        console.log("\n❌ Không nhận được stream từ proxy.\n");
        ask();
        return;
      }

      console.log('\n🤖 Qwen3:');
      
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Giải mã cụm dữ liệu nhị phân vừa nhận được sang chuỗi chữ
        buffer += decoder.decode(value, { stream: true });
        
        // Tách chuỗi theo các dòng mới
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Giữ lại dòng cuối cùng chưa hoàn chỉnh trong bộ đệm

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine || cleanedLine === 'data: [DONE]') continue;
          
          if (cleanedLine.startsWith('data: ')) {
            try {
              const jsonStr = cleanedLine.slice(6);
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content || '';
              process.stdout.write(content); // Đẩy chữ ra màn hình thời gian thực
            } catch (e) {
              // Bỏ qua nếu dòng JSON bị cắt nửa chừng chưa kịp nhận hết
            }
          }
        }
      }
      console.log('\n'); // Xuống dòng khi bot trả lời xong hoàn toàn
      
    } catch (err) {
      console.log(`\n❌ Lỗi hệ thống: ${err.message}\n`);
    }
    ask();
  });
}
ask();
