export class ValidationPanel {
    constructor(container) {
        this.container = container;
    }

    render(validation) {
        const summaries = [
            { state: validation.isValid ? 'ok' : 'error', title: validation.isValid ? 'Ready to play' : 'Fix errors', body: validation.isValid ? 'The level can be launched into the runtime.' : 'Resolve blocking issues before saving or testing.' },
            { state: 'ok', title: `Pellets ${validation.counts.dots + validation.counts.powerPellets}`, body: `${validation.counts.dots} dots and ${validation.counts.powerPellets} power pellets.` },
            { state: validation.counts.ghosts > 0 ? 'ok' : 'error', title: `Ghosts ${validation.counts.ghosts}`, body: `${validation.counts.ghosts} spawn tiles currently placed.` }
        ];

        const issueCards = validation.issues.map((issue) => ({
            state: issue.severity === 'warn' ? 'warn' : 'error',
            title: issue.label,
            body: issue.message
        }));

        this.container.className = 'validation-panel';
        this.container.innerHTML = [...summaries, ...issueCards].map((item) => `
            <article class="validation-card" data-state="${item.state}">
                <strong>${item.title}</strong>
                <span>${item.body}</span>
            </article>
        `).join('');
    }
}