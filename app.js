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
        return item.id;
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

        // Fix canvas sizing on tab switch
        setTimeout(() => {
            if(module === 'dashboard' && app.gauge) app.gauge.resize();
            if(module === 'smed' && app.smed.chart) app.smed.chart.resize();
            if(module === 'spaghetti' && app.spaghetti.canvas) app.spaghetti.resizeCanvas();
        }, 50);
    },

    initGauge() {
        const ctx = document.getElementById('globalGauge');
        if(!ctx) return;
        this.gauge = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#10B981', '#E2E8F0'],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: 270,
                }]
            },
            options: { cutout: '85%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
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
            const ctx = document.getElementById('smedChart');
            if(!ctx) return;
            this.chart = new Chart(ctx.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: ['Interno (Máquina Parada)', 'Externo (Máquina Corriendo)'],
                    datasets: [{
                        data: [0, 0],
                        backgroundColor: ['#EF4444', '#10B981'],
                        borderWidth: 2, borderColor: '#FFFFFF'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });
            this.refresh();
        },
        addTask() {
            const name = document.getElementById('smed-task-name').value;
            const type = document.getElementById('smed-task-type').value;
            const time = parseFloat(document.getElementById('smed-task-time').value);
            
            if(!name || !time) return alert('Ingrese nombre y tiempo de la tarea');
            
            db.add('ecolens_smed', { name, type, time });
            
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
            
            if(this.chart) {
                this.chart.data.datasets[0].data = [intTime, extTime];
                this.chart.update();
            }
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
    }
};

window.onload = () => app.init();
