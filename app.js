const STANDARD_TIME = 15.0; // Standard 15s per cycle
const OEE_THRESHOLD = 15.0; 
const ANDON_THRESHOLD = 1.25;

const db = {
    get: (key) => JSON.parse(localStorage.getItem(key)) || [],
    set: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
    add: (key, item) => {
        const data = db.get(key);
        item.id = Date.now().toString();
        item.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        data.push(item);
        db.set(key, data);
    },
    remove: (key, id) => {
        let data = db.get(key);
        data = data.filter(d => d.id !== id);
        db.set(key, data);
    },
    clearAll: () => {
        localStorage.removeItem('ecolens_temp');
        localStorage.removeItem('ecolens_press');
        localStorage.removeItem('ecolens_rpm');
        localStorage.removeItem('ecolens_diam');
    }
};

const app = {
    currentUser: null,
    gauge: null,
    
    init() {
        const savedUser = localStorage.getItem('ecolens_user');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.showApp();
        }
        
        this.initGauge();
        this.dashboard.init();
        this.hildegard.init();
        this.monitoring.init();
    },

    login() {
        const user = document.getElementById('username').value;
        if (!user) return alert('Ingrese un usuario');
        
        let role = 'Operador';
        if (user.toLowerCase().includes('admin') || user.toLowerCase().includes('ing')) role = 'Ingeniero';
        if (user.toLowerCase().includes('super')) role = 'Supervisor';

        this.currentUser = { name: user, role: role };
        localStorage.setItem('ecolens_user', JSON.stringify(this.currentUser));
        this.showApp();
    },

    logout() {
        localStorage.removeItem('ecolens_user');
        this.currentUser = null;
        document.getElementById('main-app').classList.remove('active');
        document.getElementById('login-view').classList.add('active');
    },

    showApp() {
        document.getElementById('login-view').classList.remove('active');
        document.getElementById('main-app').classList.add('active');
        
        document.getElementById('user-info').innerText = `${this.currentUser.role} | ${this.currentUser.name}`;
        
        if (this.currentUser.role === 'Ingeniero' || this.currentUser.role === 'Supervisor') {
            document.getElementById('engineer-menus').style.display = 'block';
        } else {
            document.getElementById('engineer-menus').style.display = 'none';
        }

        this.navigate('dashboard');
    },

    navigate(module) {
        document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        const modEl = document.getElementById(`mod-${module}`);
        if(modEl) modEl.classList.add('active');
        
        const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.innerText.toLowerCase().includes(module.substring(0, 3)));
        if(btn) btn.classList.add('active');
    },

    initGauge() {
        const ctx = document.getElementById('globalGauge');
        if(!ctx) return;
        this.gauge = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#10B981', '#1E293B'],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: 270,
                }]
            },
            options: { cutout: '85%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
    },

    updateGauge(oee) {
        if(!this.gauge) return;
        oee = Math.min(100, Math.max(0, oee));
        let color = '#10B981'; // Green
        if(oee < 70) color = '#EF4444'; // Red
        else if(oee < 85) color = '#F59E0B'; // Warning
        
        this.gauge.data.datasets[0].data = [oee, 100 - oee];
        this.gauge.data.datasets[0].backgroundColor[0] = color;
        this.gauge.update();
    },

    dashboard: {
        startTime: null, subStartTime: null, timerId: null,
        running: false, laps: [], cycleCount: 0,
        
        init() {
            this.display = document.getElementById('main-timer');
            this.subDisplay = document.getElementById('sub-timer');
            this.btnStart = document.getElementById('btn-start-lap');
            this.btnPause = document.getElementById('btn-pause');
            this.list = document.getElementById('lap-items');
        },

        updateTimer() {
            const now = Date.now();
            const diff = (now - app.dashboard.startTime) / 1000;
            const m = Math.floor(diff / 60);
            const s = Math.floor(diff % 60);
            const ms = Math.floor((diff % 1) * 100);
            app.dashboard.display.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}:${ms.toString().padStart(2,'0')}`;

            const subDiff = (now - app.dashboard.subStartTime) / 1000;
            const sm = Math.floor(subDiff / 60);
            const ss = Math.floor(subDiff % 60);
            const sms = Math.floor((subDiff % 1) * 100);
            app.dashboard.subDisplay.innerText = `PARCIAL: ${sm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}.${sms.toString().padStart(2,'0')}`;

            // Andon colors
            const panel = document.querySelector('.timer-panel');
            if (subDiff > STANDARD_TIME * ANDON_THRESHOLD) panel.style.borderColor = 'var(--accent-danger)';
            else if (subDiff > STANDARD_TIME) panel.style.borderColor = 'var(--accent-warning)';
            else panel.style.borderColor = 'var(--panel-hover)';
        },

        handleStartLap() {
            if (!this.running && this.laps.length === 0 && !this.startTime) {
                // START
                this.startTime = Date.now();
                this.subStartTime = this.startTime;
                this.timerId = setInterval(this.updateTimer, 50);
                this.running = true;
                this.btnStart.innerText = "MARCAR VUELTA (LAP)";
                this.btnStart.className = "btn btn-blue btn-block";
                this.btnPause.disabled = false;
            } else if (this.running) {
                // LAP
                const now = Date.now();
                const lap = (now - this.subStartTime) / 1000;
                const total = (now - this.startTime) / 1000;
                this.cycleCount++;
                this.laps.push({ id: this.cycleCount, lap, total });
                this.subStartTime = now;
                this.syncHistory();
            }
        },

        togglePause() {
            if (this.running) {
                clearInterval(this.timerId);
                this.running = false;
                this.btnPause.innerText = "REANUDAR";
                this.btnPause.className = "btn btn-green btn-block";
                this.btnStart.disabled = true;
            } else {
                const now = Date.now();
                // Adjust start times by the paused duration (approximate without storing pause intervals)
                const pausedDur = now - this.subStartTime;
                // Complex pause logic simplified for SPA
                this.startTime += pausedDur;
                this.subStartTime += pausedDur;
                
                this.timerId = setInterval(this.updateTimer, 50);
                this.running = true;
                this.btnPause.innerText = "PAUSAR";
                this.btnPause.className = "btn btn-gray btn-block";
                this.btnStart.disabled = false;
            }
        },

        clearData() {
            clearInterval(this.timerId);
            this.running = false;
            this.startTime = null;
            this.subStartTime = null;
            this.laps = [];
            this.cycleCount = 0;
            this.display.innerText = "00:00:00";
            this.subDisplay.innerText = "PARCIAL: 00:00.00";
            document.querySelector('.timer-panel').style.borderColor = 'var(--panel-hover)';
            this.btnStart.innerText = "INICIAR CAPTURA";
            this.btnStart.className = "btn btn-green btn-block";
            this.btnStart.disabled = false;
            this.btnPause.disabled = true;
            this.btnPause.innerText = "PAUSAR";
            this.btnPause.className = "btn btn-gray btn-block";
            
            document.getElementById('kpi-last-lap').innerText = "---";
            document.getElementById('kpi-avg-lap').innerText = "---";
            document.getElementById('kpi-oee-dash').innerText = "0%";
            app.updateGauge(0);
            this.syncHistory();
        },

        syncHistory() {
            this.list.innerHTML = '';
            let sum = 0;
            const reversed = [...this.laps].reverse();
            
            reversed.forEach(l => {
                sum += l.lap;
                const div = document.createElement('div');
                div.className = 'lap-item';
                div.innerHTML = `<span style="width: 40px">#${l.id.toString().padStart(2,'0')}</span>
                                 <span style="width: 130px; color: var(--accent-blue)">${l.lap.toFixed(2)}s</span>
                                 <span style="width: 150px; color: var(--text-s)">${l.total.toFixed(2)}s</span>`;
                this.list.appendChild(div);
            });

            if (this.laps.length > 0) {
                const last = this.laps[this.laps.length - 1].lap;
                const avg = sum / this.laps.length;
                let oee = Math.floor((STANDARD_TIME / last) * 100);
                if(oee > 100) oee = 100;

                document.getElementById('kpi-last-lap').innerText = `${last.toFixed(2)}s`;
                document.getElementById('kpi-avg-lap').innerText = `${avg.toFixed(2)}s`;
                document.getElementById('kpi-oee-dash').innerText = `${oee}%`;
                app.updateGauge(oee);
            }
        }
    },

    hildegard: {
        init() {
            this.refresh('temp');
            this.refresh('press');
            this.refresh('rpm');
            this.refresh('diam');
        },
        saveTemp() {
            const v = document.getElementById('h-temp').value;
            if(!v) return;
            db.add('ecolens_temp', { val: v, unit: '°C' });
            document.getElementById('h-temp').value = '';
            this.refresh('temp');
        },
        savePress() {
            const v = document.getElementById('h-press').value;
            if(!v) return;
            db.add('ecolens_press', { val: v, unit: 'PSI' });
            document.getElementById('h-press').value = '';
            this.refresh('press');
        },
        saveRPM() {
            const v = document.getElementById('h-rpm').value;
            if(!v) return;
            db.add('ecolens_rpm', { val: v, unit: 'RPM' });
            document.getElementById('h-rpm').value = '';
            this.refresh('rpm');
        },
        saveDiam() {
            const v = document.getElementById('h-diam').value;
            if(!v) return;
            db.add('ecolens_diam', { val: v, unit: 'mm' });
            document.getElementById('h-diam').value = '';
            this.refresh('diam');
        },
        del(key, id) {
            if(confirm('¿Eliminar registro?')) {
                db.remove(`ecolens_${key}`, id);
                this.refresh(key);
            }
        },
        clearAll() {
            if(confirm('¿Borrar TODO el historial modular?')) {
                db.clearAll();
                this.init();
            }
        },
        refresh(key) {
            const list = document.getElementById(`list-${key}`);
            if(!list) return;
            list.innerHTML = '';
            const data = db.get(`ecolens_${key}`);
            data.slice().reverse().forEach(d => {
                const item = document.createElement('div');
                item.className = 'log-item';
                item.innerHTML = `
                    <div>
                        <span class="log-time">[${d.time}]</span>
                        <span class="log-val" style="margin-left: 10px">${d.val} ${d.unit}</span>
                    </div>
                    <button class="log-del" onclick="app.hildegard.del('${key}', '${d.id}')">🗑️</button>
                `;
                list.appendChild(item);
            });
        },
        switchTab(key) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(`tab-${key}`).classList.add('active');
        }
    },

    monitoring: {
        init() {
            this.refresh();
            this.calcCapability();
        },
        saveDefect() {
            const type = document.getElementById('m-defect-type').value;
            db.add('ecolens_defects', { val: type, unit: '' });
            this.refresh();
        },
        del(id) {
            db.remove('ecolens_defects', id);
            this.refresh();
        },
        refresh() {
            const list = document.getElementById('list-defects');
            if(!list) return;
            list.innerHTML = '';
            const data = db.get('ecolens_defects');
            data.slice().reverse().forEach(d => {
                const item = document.createElement('div');
                item.className = 'log-item';
                item.innerHTML = `
                    <div>
                        <span class="log-time">[${d.time}]</span>
                        <span class="log-val text-danger" style="margin-left: 10px">${d.val}</span>
                    </div>
                    <button class="log-del" onclick="app.monitoring.del('${d.id}')">🗑️</button>
                `;
                list.appendChild(item);
            });
        },
        calcCapability() {
            const diams = db.get('ecolens_diam').map(d => parseFloat(d.val));
            if(diams.length < 2) {
                document.getElementById('kpi-cp').innerText = "N/A";
                document.getElementById('kpi-cpk').innerText = "N/A";
                return;
            }
            // Specs
            const LSL = 1.70; const USL = 1.80;
            const mean = diams.reduce((a,b) => a+b, 0) / diams.length;
            const stdev = Math.sqrt(diams.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / (diams.length - 1)) || 0.001; // Avoid div 0
            
            const cp = (USL - LSL) / (6 * stdev);
            const cpl = (mean - LSL) / (3 * stdev);
            const cpu = (USL - mean) / (3 * stdev);
            const cpk = Math.min(cpl, cpu);
            
            document.getElementById('kpi-cp').innerText = cp.toFixed(2);
            document.getElementById('kpi-cpk').innerText = cpk.toFixed(2);
            
            if(cpk < 1.0) document.getElementById('kpi-cpk').className = 'text-danger';
            else if(cpk < 1.33) document.getElementById('kpi-cpk').className = 'text-warning';
            else document.getElementById('kpi-cpk').className = 'text-green';
        }
    },

    smed: {
        calculate() {
            const intTime = parseFloat(document.getElementById('smed-int').value) || 0;
            const extTime = parseFloat(document.getElementById('smed-ext').value) || 0;
            const total = intTime + extTime;
            document.getElementById('smed-result').innerText = `Tiempo de Cambio (C/O): ${total.toFixed(2)} min`;
        }
    }
};

window.onload = () => app.init();
