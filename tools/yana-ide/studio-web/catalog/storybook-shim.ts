// Thay cho "storybook/preview-api" trong các ví dụ mẫu của Cline: chỉ cần useArgs, nên giữ args trong state cục bộ.
import { useState } from 'react';

export function useArgs<T extends Record<string, unknown>>(): [T, (updates: Partial<T>) => void] {
	const [args, setArgs] = useState<T>({} as T);
	return [args, updates => setArgs(current => ({ ...current, ...updates }))];
}
