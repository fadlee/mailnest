export { cn } from './cn.js';

export function formatDate(date: Date | string): string {
	const d = new Date(date);
	const now = new Date();
	const diff = now.getTime() - d.getTime();
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (days === 0) {
		return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
	} else if (days === 1) {
		return 'Yesterday';
	} else if (days < 7) {
		return d.toLocaleDateString('en-US', { weekday: 'short' });
	} else if (d.getFullYear() === now.getFullYear()) {
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	} else {
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
}

export function getInitials(name: string): string {
	return name
		.split(' ')
		.map((n) => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
}

export function truncate(str: string, length: number): string {
	if (str.length <= length) return str;
	return str.slice(0, length) + '...';
}

export function getAvatarColor(name: string): string {
	const colors = [
		'bg-red-500',
		'bg-orange-500',
		'bg-amber-500',
		'bg-emerald-500',
		'bg-teal-500',
		'bg-cyan-500',
		'bg-blue-500',
		'bg-indigo-500',
		'bg-violet-500',
		'bg-purple-500',
		'bg-pink-500',
		'bg-rose-500'
	];
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return colors[Math.abs(hash) % colors.length];
}
