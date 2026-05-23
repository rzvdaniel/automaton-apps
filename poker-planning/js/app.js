const STORAGE_KEY = 'poker-planning-session';
const CARD_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

const defaultState = {
    sessionName: 'Sprint planning room',
    storyTitle: '',
    notes: '',
    revealed: false,
    players: []
};

const state = loadState();

const elements = {
    sessionNameInput: document.querySelector('[data-role="session-name-input"]'),
    storyInput: document.querySelector('[data-role="story-input"]'),
    notesInput: document.querySelector('[data-role="notes-input"]'),
    playerForm: document.querySelector('[data-role="player-form"]'),
    playerNameInput: document.querySelector('[data-role="player-name-input"]'),
    playersList: document.querySelector('[data-role="players-list"]'),
    board: document.querySelector('[data-role="board"]'),
    globalDeck: document.querySelector('[data-role="global-deck"]'),
    playerCount: document.querySelector('[data-role="player-count"]'),
    voteCount: document.querySelector('[data-role="vote-count"]'),
    consensus: document.querySelector('[data-role="consensus"]'),
    roundInsight: document.querySelector('[data-role="round-insight"]'),
    roundState: document.querySelector('[data-role="round-state"]'),
    storyTitle: document.querySelector('[data-role="story-title"]'),
    playerTemplate: document.querySelector('[data-template="player-row"]'),
    boardTemplate: document.querySelector('[data-template="board-card"]')
};

bindEvents();
render();

function bindEvents() {
    elements.sessionNameInput.addEventListener('input', (event) => {
        state.sessionName = event.target.value;
        persistState();
    });

    elements.storyInput.addEventListener('input', (event) => {
        state.storyTitle = event.target.value;
        render();
    });

    elements.notesInput.addEventListener('input', (event) => {
        state.notes = event.target.value;
        render();
    });

    elements.playerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = elements.playerNameInput.value.trim();
        if (!name) {
            return;
        }

        state.players.push({
            id: crypto.randomUUID(),
            name,
            vote: null
        });
        elements.playerNameInput.value = '';
        persistState();
        render();
    });

    document.querySelectorAll('[data-action="reveal-cards"]').forEach((button) => {
        button.addEventListener('click', () => {
            state.revealed = true;
            persistState();
            render();
        });
    });

    document.querySelector('[data-action="new-round"]').addEventListener('click', () => {
        state.revealed = false;
        state.players = state.players.map((player) => ({ ...player, vote: null }));
        persistState();
        render();
    });

    document.querySelector('[data-action="copy-summary"]').addEventListener('click', async () => {
        const summary = buildSummary();
        try {
            await navigator.clipboard.writeText(summary);
            document.querySelector('[data-role="round-insight"]').textContent = 'Round summary copied to the clipboard.';
        } catch {
            document.querySelector('[data-role="round-insight"]').textContent = summary;
        }
    });

    document.querySelector('[data-action="reset-session"]').addEventListener('click', () => {
        Object.assign(state, structuredClone(defaultState));
        persistState();
        render();
    });
}

function render() {
    elements.sessionNameInput.value = state.sessionName;
    elements.storyInput.value = state.storyTitle;
    elements.notesInput.value = state.notes;
    elements.storyTitle.textContent = state.storyTitle.trim() || 'Untitled story';
    elements.roundState.textContent = state.revealed ? 'Cards revealed' : 'Voting open';
    elements.playerCount.textContent = String(state.players.length);
    elements.voteCount.textContent = String(state.players.filter((player) => player.vote !== null).length);
    elements.consensus.textContent = getConsensusLabel();
    elements.roundInsight.textContent = getInsight();

    renderGlobalDeck();
    renderPlayers();
    renderBoard();
    persistState();
}

function renderGlobalDeck() {
    const chips = CARD_VALUES.map((value) => `<span class="deck-chip is-reference">${value}</span>`).join('');
    elements.globalDeck.innerHTML = chips;
}

function renderPlayers() {
    if (!state.players.length) {
        elements.playersList.innerHTML = '<p class="rounded-2xl border border-dashed border-ink/10 px-4 py-5 text-sm text-ink/55">No players yet. Add names to open the table.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    state.players.forEach((player) => {
        const node = elements.playerTemplate.content.firstElementChild.cloneNode(true);
        node.querySelector('[data-role="player-name"]').textContent = player.name;
        node.querySelector('[data-role="player-status"]').textContent = player.vote === null ? 'No card selected yet' : `Picked ${state.revealed ? player.vote : 'a card'}`;

        const playerDeck = node.querySelector('[data-role="player-deck"]');
        CARD_VALUES.forEach((value) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `deck-chip${player.vote === value ? ' is-selected' : ''}`;
            button.textContent = value;
            button.addEventListener('click', () => {
                player.vote = value;
                state.revealed = false;
                persistState();
                render();
            });
            playerDeck.appendChild(button);
        });

        node.querySelector('[data-action="remove-player"]').addEventListener('click', () => {
            state.players = state.players.filter((entry) => entry.id !== player.id);
            persistState();
            render();
        });

        fragment.appendChild(node);
    });

    elements.playersList.replaceChildren(fragment);
}

function renderBoard() {
    if (!state.players.length) {
        elements.board.innerHTML = '<p class="rounded-2xl border border-dashed border-ink/10 px-4 py-8 text-sm text-ink/55 md:col-span-2">The board fills as soon as players join the session.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    state.players.forEach((player) => {
        const node = elements.boardTemplate.content.firstElementChild.cloneNode(true);
        node.querySelector('[data-role="board-player-name"]').textContent = player.name;

        const valueElement = node.querySelector('[data-role="board-value"]');
        const captionElement = node.querySelector('[data-role="board-caption"]');
        const stateElement = node.querySelector('[data-role="board-player-state"]');

        if (player.vote === null) {
            valueElement.textContent = '•';
            captionElement.textContent = 'Waiting for estimate';
            stateElement.textContent = 'Pending';
        } else if (!state.revealed) {
            valueElement.textContent = '🂠';
            captionElement.textContent = 'Card locked in';
            stateElement.textContent = 'Hidden';
        } else {
            valueElement.textContent = player.vote;
            captionElement.textContent = getVoteCaption(player.vote);
            stateElement.textContent = 'Revealed';
        }

        fragment.appendChild(node);
    });

    elements.board.replaceChildren(fragment);
}

function getConsensusLabel() {
    const votes = getNumericVotes();
    if (!state.revealed || !votes.length) {
        return '-';
    }

    const uniqueVotes = new Set(votes);
    if (uniqueVotes.size === 1) {
        return `${votes[0]} pts`;
    }

    const average = votes.reduce((sum, vote) => sum + vote, 0) / votes.length;
    const nearest = CARD_VALUES
        .map(Number)
        .filter((value) => Number.isFinite(value))
        .reduce((best, value) => Math.abs(value - average) < Math.abs(best - average) ? value : best, 0);

    return `~${nearest} pts`;
}

function getInsight() {
    if (!state.players.length) {
        return 'Add a story and invite players to start the round.';
    }

    if (!state.players.every((player) => player.vote !== null)) {
        return 'Votes stay hidden until every player has picked a card and you reveal the round.';
    }

    if (!state.revealed) {
        return 'Everyone has voted. Reveal the cards when the team is ready.';
    }

    const votes = getNumericVotes();
    if (!votes.length) {
        return 'The team used non-numeric cards this round. Capture the discussion in the notes.';
    }

    const spread = Math.max(...votes) - Math.min(...votes);
    if (spread === 0) {
        return 'Strong agreement. Capture the estimate and move to the next story.';
    }

    if (spread <= 3) {
        return 'The spread is narrow. A short discussion should be enough to settle the estimate.';
    }

    return 'Wide spread detected. Compare assumptions before committing the estimate.';
}

function getVoteCaption(vote) {
    if (vote === '?') {
        return 'Needs clarification';
    }

    if (vote === '☕') {
        return 'Pause requested';
    }

    return 'Story points';
}

function getNumericVotes() {
    return state.players
        .map((player) => Number(player.vote))
        .filter((value) => Number.isFinite(value));
}

function buildSummary() {
    const lines = [
        `Session: ${state.sessionName || 'Untitled session'}`,
        `Story: ${state.storyTitle || 'Untitled story'}`,
        `Notes: ${state.notes || 'No notes added.'}`,
        `Round state: ${state.revealed ? 'Revealed' : 'Hidden'}`,
        'Votes:'
    ];

    if (!state.players.length) {
        lines.push('- No players added');
    } else {
        state.players.forEach((player) => {
            const vote = player.vote === null ? 'No vote selected' : (state.revealed ? player.vote : 'Hidden');
            lines.push(`- ${player.name}: ${vote}`);
        });
    }

    lines.push(`Consensus: ${getConsensusLabel()}`);
    return lines.join('\n');
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            return structuredClone(defaultState);
        }

        const parsed = JSON.parse(saved);
        return {
            ...structuredClone(defaultState),
            ...parsed,
            players: Array.isArray(parsed.players) ? parsed.players : []
        };
    } catch {
        return structuredClone(defaultState);
    }
}