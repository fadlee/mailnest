class ThemeStore {
	mode = $state<'light' | 'dark'>('dark');

	get isDark() {
		return this.mode === 'dark';
	}

	toggle() {
		this.mode = this.mode === 'dark' ? 'light' : 'dark';
		if (typeof document !== 'undefined') {
			document.documentElement.classList.toggle('dark', this.mode === 'dark');
		}
	}

	init() {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('mailnest-theme');
			if (saved === 'light' || saved === 'dark') {
				this.mode = saved;
			} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
				this.mode = 'light';
			}
			document.documentElement.classList.toggle('dark', this.mode === 'dark');
		}
	}

	save() {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('mailnest-theme', this.mode);
		}
	}
}

export const themeStore = new ThemeStore();
