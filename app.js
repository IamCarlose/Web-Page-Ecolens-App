const STANDARD_TIME = 15.0; // Standard 15s per cycle
const OEE_THRESHOLD = 15.0; 
const ANDON_THRESHOLD = 1.25;

const db = {
    _k: (k) => app.currentUser ? `${app.currentUser.username}_${k}` : k,
    get: function(key) { return JSON.parse(localStorage.getItem(this._k(key))) || []; },
    set: function(key, data) { localStorage.setItem(this._k(key), JSON.stringify(data)); },
    add: function(key, item) {
        const data = this.get(key);
        item.id = Date.now().toString();
        item.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        data.push(item);
        this.set(key, data);
        return item.id;
    },
    remove: function(key, id) {
        let data = this.get(key);
        data = data.filter(d => d.id !== id);
        this.set(key, data);
    },
    clearAll: function() {
        localStorage.removeItem(this._k('ecolens_temp'));
        localStorage.removeItem(this._k('ecolens_press'));
        localStorage.removeItem(this._k('ecolens_rpm'));
        localStorage.removeItem(this._k('ecolens_diam'));
    }
};

const app = {
    currentUser: null,
    gauge: null,
    apiURL: 'https://script.google.com/macros/s/AKfycbyN1_Wf4vnvad_pHkx7cQo6fNgah90j21busfajrf0BKsBPbuXpr8cHGzUIDo5Fzj2h/exec',

    async sendToGoogleSheets(type, value) {
        if(!this.apiURL) return;
        const timestamp = new Date().toLocaleString();
        const user = this.currentUser ? this.currentUser.name : 'Desconocido';
        
        // Bulletproof GET request avoids CORS and 302 body-drop issues
        const url = `${this.apiURL}?timestamp=${encodeURIComponent(timestamp)}&user=${encodeURIComponent(user)}&type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`;
        
        try {
            fetch(url, { mode: 'no-cors' });
        } catch(e) { console.error("Error sending to sheets", e); }
    },
    
    init() {
        // Init users array if empty with the strictly reserved engineers
        if(!localStorage.getItem('ecolens_users_db')) {
            localStorage.setItem('ecolens_users_db', JSON.stringify([
                { name: 'Admin', username: 'admin', password: '123', role: 'Ingeniero' },
                { name: 'Carlos López', username: 'Carlos López', password: 'C.Lopez*2026!', role: 'Ingeniero' },
                { name: 'Natalia Arteaga', username: 'Natalia Arteaga', password: 'N4rt34g4_Eng#26', role: 'Ingeniero' },
                { name: 'David Hernández', username: 'David Hernández', password: 'david.hernandez_99$', role: 'Ingeniero' },
                { name: 'Lorena Negrete', username: 'Lorena Negrete', password: 'L.Negrete*2026!', role: 'Ingeniero' }
            ]));
        }

        const savedUser = localStorage.getItem('ecolens_user_session');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.showApp();
        }
        
        // Wait for DOM
        setTimeout(() => {
            this.initGauge();
            this.dashboard.init();
            this.hildegard.init();
            this.monitoring.init();
            this.smed.init();
            this.spaghetti.init();
        }, 100);
    },

    auth: {
        toggleForm() {
            const login = document.getElementById('form-login');
            const reg = document.getElementById('form-register');
            if (login.style.display === 'none') {
                login.style.display = 'block';
                reg.style.display = 'none';
            } else {
                login.style.display = 'none';
                reg.style.display = 'block';
            }
        },

        login() {
            const user = document.getElementById('username').value;
            const pass = document.getElementById('password').value;
            if (!user || !pass) return alert('Ingrese usuario y contraseña');
            
            const users = JSON.parse(localStorage.getItem('ecolens_users_db'));
            const found = users.find(u => u.username === user && u.password === pass);
            
            if (found) {
                app.currentUser = { name: found.name, role: found.role, username: found.username };
                localStorage.setItem('ecolens_user_session', JSON.stringify(app.currentUser));
                app.showApp();
            } else {
                alert('Credenciales incorrectas');
            }
        },

        register() {
            const name = document.getElementById('reg-name').value;
            const user = document.getElementById('reg-username').value;
            const pass = document.getElementById('reg-password').value;
            const role = document.getElementById('reg-role').value;
            
            if (!name || !user || !pass) return alert('Complete todos los campos');
            
            const users = JSON.parse(localStorage.getItem('ecolens_users_db'));
            if (users.find(u => u.username === user)) {
                return alert('Ese usuario ya existe');
            }
            
            users.push({ name, username: user, password: pass, role });
            localStorage.setItem('ecolens_users_db', JSON.stringify(users));
            
            alert('Cuenta creada exitosamente. Por favor inicie sesión.');
            this.toggleForm();
        },

        logout() {
            localStorage.removeItem('ecolens_user_session');
            app.currentUser = null;
            document.getElementById('main-app').classList.remove('active');
            document.getElementById('login-view').classList.add('active');
            
            // Clear inputs
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        }
    },

    showApp() {
        document.getElementById('login-view').classList.remove('active');
        document.getElementById('main-app').classList.add('active');
        
        document.getElementById('user-info').innerText = `${this.currentUser.role} | ${this.currentUser.username}`;
        
        if (this.currentUser.role === 'Ingeniero' || this.currentUser.role === 'Supervisor') {
            document.getElementById('engineer-menus').style.display = 'block';
        } else {
            document.getElementById('engineer-menus').style.display = 'none';
        }

        this.navigate('dashboard');
        
        // Ensure gauge resizes properly on first app show
        setTimeout(() => {
            if(app.gauge) app.gauge.resize();
        }, 300);
    },

    navigate(module) {
        document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        const modEl = document.getElementById(`mod-${module}`);
        if(modEl) modEl.classList.add('active');
        
        const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.innerText.toLowerCase().includes(module.substring(0, 3)));
        if(btn) btn.classList.add('active');

        // Fix canvas sizing on tab switch by recreating charts when visible
        setTimeout(() => {
            if(module === 'dashboard') {
                app.initGauge();
                // Check if there is data to update gauge
                if(app.dashboard.laps.length > 0) {
                    const lastLap = app.dashboard.laps[app.dashboard.laps.length - 1].lap;
                    let oee = Math.floor((STANDARD_TIME / lastLap) * 100);
                    app.updateGauge(oee > 100 ? 100 : oee);
                }
            }
            if(module === 'smed') app.smed.initChart();
            if(module === 'doe') app.doe.initCharts();
            if(module === 'spaghetti' && app.spaghetti.canvas) app.spaghetti.resizeCanvas();
        }, 50);
    },

    initGauge() {
        const ctx = document.getElementById('globalGauge');
        if(!ctx) return;
        
        if(this.gauge) this.gauge.destroy();
        
        this.gauge = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#10B981', '#E2E8F0'],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: -90,
                }]
            },
            options: { cutout: '85%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: false }
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
            else panel.style.borderColor = '#E2E8F0';
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
                app.sendToGoogleSheets('Dashboard - Producción', `Lap: ${lap.toFixed(2)}s | Total: ${total.toFixed(2)}s`);
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
                // Adjust start times
                const pausedDur = now - this.subStartTime;
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
            document.querySelector('.timer-panel').style.borderColor = '#E2E8F0';
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
        _save(key, val, unit) {
            const data = db.get(`ecolens_${key}`);
            const item = { id: Date.now().toString(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), val, unit };
            data.push(item);
            db.set(`ecolens_${key}`, data);
            app.sendToGoogleSheets(`Hildegard - ${key}`, `${val} ${unit}`);
            this.refresh(key);
        },
        saveTemp() {
            const v = document.getElementById('h-temp').value;
            if(!v) return;
            this._save('temp', v, '°C');
            document.getElementById('h-temp').value = '';
        },
        savePress() {
            const v = document.getElementById('h-press').value;
            if(!v) return;
            this._save('press', v, 'PSI');
            document.getElementById('h-press').value = '';
        },
        saveRPM() {
            const v = document.getElementById('h-rpm').value;
            if(!v) return;
            this._save('rpm', v, 'RPM');
            document.getElementById('h-rpm').value = '';
        },
        saveDiam() {
            const v = document.getElementById('h-diam').value;
            if(!v) return;
            this._save('diam', v, 'mm');
            document.getElementById('h-diam').value = '';
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
            app.sendToGoogleSheets('Monitoreo - Defecto', type);
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
            const stdev = Math.sqrt(diams.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / (diams.length - 1)) || 0.001; 
            
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
        chart: null,
        init() {
            this.refresh();
        },
        initChart(intTime = 0, extTime = 0) {
            const ctx = document.getElementById('smedChart');
            if(!ctx) return;
            
            if(this.chart) this.chart.destroy();
            
            this.chart = new Chart(ctx.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: ['Interno (Máquina Parada)', 'Externo (Máquina Corriendo)'],
                    datasets: [{
                        data: [intTime, extTime],
                        backgroundColor: ['#EF4444', '#10B981'],
                        borderWidth: 2, borderColor: '#FFFFFF'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, animation: false }
            });
        },
        addTask() {
            const name = document.getElementById('smed-task-name').value;
            const type = document.getElementById('smed-task-type').value;
            const time = parseFloat(document.getElementById('smed-task-time').value);
            
            if(!name || !time) return alert('Ingrese nombre y tiempo de la tarea');
            
            db.add('ecolens_smed', { name, type, time });
            app.sendToGoogleSheets(`SMED - ${type}`, `${name}: ${time} min`);
            
            document.getElementById('smed-task-name').value = '';
            document.getElementById('smed-task-time').value = '';
            this.refresh();
        },
        delTask(id) {
            db.remove('ecolens_smed', id);
            this.refresh();
        },
        refresh() {
            const tbody = document.getElementById('smed-table-body');
            if(!tbody) return;
            tbody.innerHTML = '';
            
            const tasks = db.get('ecolens_smed');
            let intTime = 0; let extTime = 0;
            
            tasks.forEach(t => {
                if(t.type === 'Interno') intTime += parseFloat(t.time);
                else extTime += parseFloat(t.time);
                
                const tr = document.createElement('tr');
                const badge = t.type === 'Interno' ? 'badge-int' : 'badge-ext';
                tr.innerHTML = `
                    <td>${t.name}</td>
                    <td><span class="smed-badge ${badge}">${t.type}</span></td>
                    <td>${t.time} min</td>
                    <td><button class="log-del" onclick="app.smed.delTask('${t.id}')">🗑️</button></td>
                `;
                tbody.appendChild(tr);
            });
            
            document.getElementById('lbl-total-int').innerText = `INT: ${intTime.toFixed(1)} min`;
            document.getElementById('lbl-total-ext').innerText = `EXT: ${extTime.toFixed(1)} min`;
            
            this.initChart(intTime, extTime);
        }
    },

    spaghetti: {
        canvas: null, ctx: null, 
        nodes: [], edges: [], paths: [],
        mode: null, // 'link', 'draw', null
        selectedNode: null,
        dragNode: null,
        isDrawing: false,
        currentPath: [],
        
        init() {
            this.canvas = document.getElementById('spaghettiCanvas');
            if(!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());

            // Bind events
            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
            
            const saved = db.get('ecolens_spag_data');
            if(saved && !Array.isArray(saved)) {
                this.nodes = saved.nodes || [];
                this.edges = saved.edges || [];
                this.paths = saved.paths || [];
            } else {
                this.nodes = []; this.edges = []; this.paths = [];
            }
            this.redraw();
        },
        
        resizeCanvas() {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.redraw();
        },
        
        save() {
            db.set('ecolens_spag_data', { nodes: this.nodes, edges: this.edges, paths: this.paths });
        },

        addNode() {
            let name = document.getElementById('spag-name').value;
            if(!name) name = `EST-${this.nodes.length + 1}`;
            const shape = document.getElementById('spag-shape').value;
            const color = document.getElementById('spag-color').value;
            
            this.nodes.push({ id: Date.now().toString(), name, shape, color, x: 100, y: 100 });
            document.getElementById('spag-name').value = '';
            this.save();
            this.redraw();
        },

        toggleMode(newMode) {
            if(this.mode === newMode) this.mode = null;
            else this.mode = newMode;
            
            document.getElementById('btn-spag-link').className = this.mode === 'link' ? 'btn btn-blue btn-block' : 'btn btn-outline btn-block';
            document.getElementById('btn-spag-draw').className = this.mode === 'draw' ? 'btn btn-blue btn-block' : 'btn btn-outline btn-block';
            this.selectedNode = null;
        },

        undo() {
            if(this.paths.length > 0) this.paths.pop();
            else if(this.edges.length > 0) this.edges.pop();
            else if(this.nodes.length > 0) this.nodes.pop();
            this.save();
            this.redraw();
        },

        clearAll() {
            if(confirm('¿Borrar todo el diagrama?')) {
                this.nodes = []; this.edges = []; this.paths = [];
                this.save();
                this.redraw();
            }
        },

        getMousePos(e) {
            const rect = this.canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        },

        findNode(x, y) {
            for(let i=this.nodes.length-1; i>=0; i--) {
                const n = this.nodes[i];
                if(Math.abs(n.x - x) <= 40 && Math.abs(n.y - y) <= 40) return n;
            }
            return null;
        },

        onMouseDown(e) {
            const pos = this.getMousePos(e);
            const clickedNode = this.findNode(pos.x, pos.y);

            if(this.mode === 'link') {
                if(clickedNode) {
                    if(!this.selectedNode) {
                        this.selectedNode = clickedNode.id;
                    } else if (this.selectedNode !== clickedNode.id) {
                        this.edges.push({ from: this.selectedNode, to: clickedNode.id });
                        this.selectedNode = null;
                        this.save();
                    }
                } else {
                    this.selectedNode = null;
                }
            } else if (this.mode === 'draw') {
                this.isDrawing = true;
                this.currentPath = [pos];
            } else {
                // Drag mode
                if(clickedNode) this.dragNode = clickedNode;
            }
            this.redraw();
        },

        onMouseMove(e) {
            const pos = this.getMousePos(e);
            if(this.dragNode) {
                this.dragNode.x = pos.x;
                this.dragNode.y = pos.y;
                this.redraw();
            } else if(this.isDrawing) {
                this.currentPath.push(pos);
                this.redraw();
                // Draw current temp path
                this.ctx.beginPath();
                this.ctx.lineWidth = 3;
                this.ctx.strokeStyle = '#2563EB';
                this.currentPath.forEach((p, i) => {
                    if(i===0) this.ctx.moveTo(p.x, p.y);
                    else this.ctx.lineTo(p.x, p.y);
                });
                this.ctx.stroke();
            }
        },

        onMouseUp(e) {
            if(this.dragNode) {
                this.save();
                this.dragNode = null;
            } else if (this.isDrawing) {
                this.isDrawing = false;
                if(this.currentPath.length > 1) {
                    this.paths.push([...this.currentPath]);
                    this.save();
                }
                this.currentPath = [];
                this.redraw();
            }
        },
        
        redraw() {
            // (Spaghetti redraw logic remains unchanged)
            if(!this.ctx) return;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw paths
            this.paths.forEach(path => {
                this.ctx.beginPath();
                this.ctx.lineWidth = 3;
                this.ctx.strokeStyle = '#94A3B8';
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                path.forEach((p, i) => {
                    if(i === 0) this.ctx.moveTo(p.x, p.y);
                    else this.ctx.lineTo(p.x, p.y);
                });
                this.ctx.stroke();
            });

            // Draw edges
            this.edges.forEach(e => {
                const n1 = this.nodes.find(n => n.id === e.from);
                const n2 = this.nodes.find(n => n.id === e.to);
                if(n1 && n2) {
                    this.ctx.beginPath();
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeStyle = '#64748B';
                    this.ctx.moveTo(n1.x, n1.y);
                    this.ctx.lineTo(n2.x, n2.y);
                    this.ctx.stroke();
                }
            });

            // Draw nodes
            this.nodes.forEach(n => {
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = n.color;
                this.ctx.fillStyle = '#FFFFFF';

                if(n.shape === 'circle') {
                    this.ctx.beginPath();
                    this.ctx.arc(n.x, n.y, 40, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke();
                } else {
                    this.ctx.beginPath();
                    this.ctx.rect(n.x - 40, n.y - 40, 80, 80);
                    this.ctx.fill();
                    this.ctx.stroke();
                }

                // Highlight selected
                if(this.selectedNode === n.id) {
                    this.ctx.strokeStyle = '#F59E0B';
                    this.ctx.lineWidth = 4;
                    this.ctx.stroke();
                }

                this.ctx.fillStyle = n.color;
                this.ctx.font = 'bold 10px Inter';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(n.name.substring(0, 8), n.x, n.y);
            });
        }
    },

    doe: {
        controlChart: null,
        histChart: null,
        scatterChart: null,

        initCharts() {
            this.renderControlChart();
            this.renderHistogram();
            this.renderScatter();
        },

        renderControlChart() {
            const ctx = document.getElementById('doeControlChart');
            if(!ctx) return;
            if(this.controlChart) this.controlChart.destroy();

            const diams = db.get('ecolens_diam').map(d => parseFloat(d.val));
            const labels = diams.map((_, i) => i + 1);

            const usl = diams.map(() => 1.80);
            const lsl = diams.map(() => 1.70);
            const nominal = diams.map(() => 1.75);

            this.controlChart = new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels.length > 0 ? labels : [1, 2, 3],
                    datasets: [
                        {
                            label: 'Diámetro Medido',
                            data: diams.length > 0 ? diams : [0, 0, 0],
                            borderColor: '#2563EB',
                            backgroundColor: '#2563EB',
                            borderWidth: 2,
                            tension: 0.1,
                            pointRadius: 4
                        },
                        {
                            label: 'USL (1.80)',
                            data: usl.length > 0 ? usl : [1.80, 1.80, 1.80],
                            borderColor: '#EF4444',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false
                        },
                        {
                            label: 'LSL (1.70)',
                            data: lsl.length > 0 ? lsl : [1.70, 1.70, 1.70],
                            borderColor: '#EF4444',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false
                        },
                        {
                            label: 'Nominal (1.75)',
                            data: nominal.length > 0 ? nominal : [1.75, 1.75, 1.75],
                            borderColor: '#10B981',
                            borderWidth: 2,
                            borderDash: [2, 2],
                            pointRadius: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        y: {
                            min: 1.60,
                            max: 1.90,
                            title: { display: true, text: 'Milímetros (mm)' }
                        },
                        x: {
                            title: { display: true, text: 'Lecturas' }
                        }
                    },
                    plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } } }
                }
            });
        },

        renderHistogram() {
            const ctx = document.getElementById('doeHistChart');
            if(!ctx) return;
            if(this.histChart) this.histChart.destroy();

            const diams = db.get('ecolens_diam').map(d => parseFloat(d.val));
            let labels = [];
            let data = [];

            if(diams.length > 0) {
                const min = Math.min(...diams);
                const max = Math.max(...diams);
                const bins = 8;
                const step = (max === min) ? 0.1 : (max - min) / bins;
                const start = (max === min) ? min - 0.4 : min;
                
                let counts = new Array(bins).fill(0);
                labels = Array.from({length: bins}, (_, i) => (start + i * step).toFixed(2));
                
                diams.forEach(d => {
                    let binIndex = Math.floor((d - start) / step);
                    if(binIndex >= bins) binIndex = bins - 1;
                    if(binIndex < 0) binIndex = 0;
                    counts[binIndex]++;
                });
                data = counts;
            } else {
                labels = ['1.6', '1.7', '1.8', '1.9'];
                data = [0, 0, 0, 0];
            }

            this.histChart = new Chart(ctx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Frecuencia',
                        data: data,
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: '#10B981',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Conteo' } },
                        x: { title: { display: true, text: 'Rango de Diámetro (mm)' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        },

        renderScatter() {
            const ctx = document.getElementById('doeScatterChart');
            if(!ctx) return;
            if(this.scatterChart) this.scatterChart.destroy();

            const temps = db.get('ecolens_temp').map(d => parseFloat(d.val));
            const rpms = db.get('ecolens_rpm').map(d => parseFloat(d.val));
            
            let scatterData = [];
            const minLen = Math.min(temps.length, rpms.length);
            
            for(let i=0; i<minLen; i++) {
                scatterData.push({ x: temps[i], y: rpms[i] });
            }

            this.scatterChart = new Chart(ctx.getContext('2d'), {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Temp vs RPM',
                        data: scatterData.length > 0 ? scatterData : [{x: 0, y: 0}],
                        backgroundColor: '#F59E0B',
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        x: {
                            title: { display: true, text: 'Temperatura (°C)' }
                        },
                        y: {
                            title: { display: true, text: 'Velocidad Tracción (RPM)' }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    },

    report: {
        async getChartImages() {
            const charts = ['doeControlChart', 'doeHistChart', 'doeScatterChart'];
            let images = [];
            for (let id of charts) {
                const canvas = document.getElementById(id);
                if (canvas) {
                    const canvasImage = await html2canvas(canvas);
                    images.push(canvasImage.toDataURL("image/png"));
                } else {
                    images.push(null);
                }
            }
            return images;
        },

        getSummaryStats() {
            const diams = db.get('ecolens_diam').map(d => parseFloat(d.val));
            let mean = 0, std = 0, cp = 0, cpk = 0;
            if (diams.length > 1) {
                mean = diams.reduce((a,b) => a+b, 0) / diams.length;
                std = Math.sqrt(diams.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / (diams.length - 1)) || 0.001; 
                cp = (1.80 - 1.70) / (6 * std);
                const cpl = (mean - 1.70) / (3 * std);
                const cpu = (1.80 - mean) / (3 * std);
                cpk = Math.min(cpl, cpu);
            } else if (diams.length === 1) {
                mean = diams[0];
            }
            const defects = db.get('ecolens_defects').length;
            
            let statusText = "Sin datos suficientes para evaluar la capacidad.";
            if (diams.length > 1) {
                if (cpk >= 1.33) statusText = "Excelente. El proceso es altamente capaz y está centrado dentro de las especificaciones de ingeniería.";
                else if (cpk >= 1.0) statusText = "Aceptable. El proceso cumple con los límites, pero requiere monitoreo para evitar derivas.";
                else statusText = "Crítico. El proceso es incapaz y está generando producto fuera de especificación. Se requiere ajuste inmediato.";
            }

            return { mean, std, cp, cpk, defects, count: diams.length, statusText };
        },

        async generatePDF() {
            try {
                if(!window.jspdf) return alert("Cargando librerías... intente en unos segundos.");
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                const stats = this.getSummaryStats();
                const user = app.currentUser ? app.currentUser.name : 'Usuario Desconocido';
                const date = new Date().toLocaleString();

                // Header
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(22);
                pdf.setTextColor(37, 99, 235); // Blue
                pdf.text("ECOLENS APP", 20, 20);
                
                pdf.setFontSize(14);
                pdf.setTextColor(15, 23, 42); // Dark
                pdf.text("REPORTE ESTADÍSTICO DE INGENIERÍA", 20, 30);
                
                pdf.setFontSize(10);
                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(100, 116, 139); // Gray
                pdf.text(`Generado por: ${user} | Fecha: ${date}`, 20, 38);
                
                pdf.line(20, 42, 190, 42);

                // Summary Assertive Text
                pdf.setFontSize(12);
                pdf.setFont("helvetica", "bold");
                pdf.setTextColor(15, 23, 42);
                pdf.text("Resumen Ejecutivo del Proceso:", 20, 50);
                
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(11);
                pdf.text(`Muestras evaluadas: ${stats.count}`, 20, 58);
                pdf.text(`Diámetro Promedio: ${stats.mean.toFixed(3)} mm (Objetivo: 1.75 mm)`, 20, 64);
                pdf.text(`Índice Cp: ${stats.cp.toFixed(2)} | Índice Cpk: ${stats.cpk.toFixed(2)}`, 20, 70);
                pdf.text(`Defectos Críticos Detectados: ${stats.defects}`, 20, 76);
                
                pdf.setFont("helvetica", "italic");
                if(stats.cpk < 1.0) pdf.setTextColor(239, 68, 68);
                else pdf.setTextColor(16, 185, 129);
                pdf.text(`Diagnóstico: ${stats.statusText}`, 20, 84);

                // Add Images
                const images = await this.getChartImages();
                
                if (images[0]) {
                    pdf.setFont("helvetica", "bold");
                    pdf.setTextColor(15, 23, 42);
                    pdf.text("1. Gráfico de Control (Diámetro vs Tiempo)", 20, 95);
                    pdf.addImage(images[0], 'PNG', 20, 100, 170, 55);
                }
                
                if (images[1]) {
                    pdf.text("2. Histograma de Distribución", 20, 165);
                    pdf.addImage(images[1], 'PNG', 20, 170, 170, 55);
                }
                
                if (images[2]) {
                    pdf.addPage();
                    pdf.text("3. Correlación: Temperatura vs Velocidad Tracción", 20, 20);
                    pdf.addImage(images[2], 'PNG', 20, 25, 170, 65);
                }

                pdf.save(`Ecolens_Reporte_${Date.now()}.pdf`);
            } catch (e) {
                console.error(e);
                alert("Hubo un error al generar el PDF.");
            }
        },

        async generateExcel() {
            try {
                if(!window.ExcelJS) return alert("Cargando librerías... intente en unos segundos.");
                const wb = new ExcelJS.Workbook();
                const stats = this.getSummaryStats();
                
                // SHEET 1: Resumen
                const ws1 = wb.addWorksheet('Resumen Analítico');
                
                // Styles
                ws1.getColumn('A').width = 30;
                ws1.getColumn('B').width = 20;
                ws1.getColumn('C').width = 20;

                ws1.mergeCells('A1:C1');
                const title = ws1.getCell('A1');
                title.value = 'ECOLENS APP - REPORTE DE INGENIERÍA';
                title.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
                title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
                title.alignment = { horizontal: 'center' };

                ws1.getCell('A3').value = 'Métricas Clave';
                ws1.getCell('A3').font = { bold: true };
                
                ws1.getCell('A4').value = 'Muestras Analizadas';
                ws1.getCell('B4').value = stats.count;
                
                ws1.getCell('A5').value = 'Diámetro Promedio (mm)';
                ws1.getCell('B5').value = stats.mean.toFixed(3);
                
                ws1.getCell('A6').value = 'Índice de Capacidad (Cpk)';
                ws1.getCell('B6').value = stats.cpk.toFixed(2);
                
                ws1.getCell('A7').value = 'Total de Defectos';
                ws1.getCell('B7').value = stats.defects;
                
                ws1.getCell('A9').value = 'Diagnóstico del Sistema:';
                ws1.getCell('A9').font = { bold: true };
                ws1.mergeCells('A10:C10');
                ws1.getCell('A10').value = stats.statusText;
                if(stats.cpk < 1.0) ws1.getCell('A10').font = { color: { argb: 'FFEF4444' } };
                else ws1.getCell('A10').font = { color: { argb: 'FF10B981' } };

                // Embebbed Charts in Excel
                const images = await this.getChartImages();
                if (images[0]) {
                    const imgId1 = wb.addImage({ base64: images[0], extension: 'png' });
                    ws1.addImage(imgId1, 'E2:O15');
                }
                if (images[1]) {
                    const imgId2 = wb.addImage({ base64: images[1], extension: 'png' });
                    ws1.addImage(imgId2, 'E17:O30');
                }
                
                // SHEET 2: Datos Crudos
                const ws2 = wb.addWorksheet('Datos Crudos (Diámetro)');
                ws2.columns = [
                    { header: 'ID', key: 'id', width: 20 },
                    { header: 'Hora', key: 'time', width: 15 },
                    { header: 'Diámetro (mm)', key: 'val', width: 20 }
                ];
                ws2.getRow(1).font = { bold: true };
                ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
                
                const diams = db.get('ecolens_diam');
                diams.forEach(d => ws2.addRow(d));

                // Generate File
                const buffer = await wb.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `Ecolens_Datos_${Date.now()}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

            } catch (e) {
                console.error(e);
                alert("Hubo un error al generar el Excel.");
            }
        }
    }
};

window.onload = () => app.init();
