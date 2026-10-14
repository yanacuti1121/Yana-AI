// Nhận thông báo "dữ liệu vừa đổi" từ extension (features/changes.js, chuyển qua features/studio-screens.js) để màn
// React cũ nạp lại thay vì giữ số liệu cũ. Trả về một số tăng dần: dùng làm `key` của màn để dựng lại nó.
import { useEffect, useState } from 'react';

type Subscribe = (channel: string, callback: (value: unknown) => void) => () => void;

// Kênh 'yana:changed' chỉ có trong IDE, nên không có trong kiểu Window.studio của app cũ (chỉ liệt kê kênh cũ);
// ép kiểu hẹp ở đây thay vì sửa kiểu của app cũ.
const subscribe = (): Subscribe => (window.studio as unknown as { on: Subscribe }).on;

export function useIdeRefresh(kinds: string[]): number {
	const [version, setVersion] = useState(0);
	useEffect(() => {
		const off = subscribe()('yana:changed', value => {
			if (Array.isArray(value) && value.some(kind => kinds.includes(String(kind)))) setVersion(current => current + 1);
		});
		return off;
	}, []);
	return version;
}
