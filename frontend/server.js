const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Servir archivos estáticos con prefijo correcto
app.use('/public', express.static('public'));
app.use('/scripts', express.static('scripts'));
app.use('/styles', express.static('styles'));
app.use('/app/3dmodels', express.static(path.resolve('/app/3dmodels')));

// Middleware para agregar base path a todas las respuestas
app.use((req, res, next) => {
    // Agregar base path para recursos en HTML
    const originalSend = res.send;
    res.send = function(body) {
        if (typeof body === 'string' && body.includes('</html>')) {
            // Corregir rutas de recursos
            body = body
                .replace(/href="styles\//g, 'href="/styles/')
                .replace(/src="scripts\//g, 'src="/scripts/')
                .replace(/href="\.\.\/styles\//g, 'href="/styles/')
                .replace(/src="\.\.\/scripts\//g, 'src="/scripts/');
        }
        originalSend.call(this, body);
    };
    next();
});

// Ruta para favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.ico'));
});

// Ruta para servir el viewer basado en school/sector/block
app.get('/:school/:sector/:block', (req, res) => {
    const { school, sector, block } = req.params;
    console.log(`Serving viewer for: ${school}/${sector}/${block}`);
    const htmlPath = path.join(__dirname, 'public', 'block.html');
    fs.readFile(htmlPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading HTML file:', err);
            return res.status(500).send('Error loading viewer');
        }
        let modifiedHtml = data
            .replace(/{{school}}/g, school)
            .replace(/{{sector}}/g, sector)
            .replace(/{{block}}/g, block);
        modifiedHtml = modifiedHtml.replace(
            '</head>',
            `<script>
                window.viewerConfig = {
                    school: "${school}",
                    sector: "${sector}", 
                    block: "${block}"
                };
                window.BACKEND_URL = "${process.env.BACKEND_URL}";
            </script>
            </head>`
        );
        res.send(modifiedHtml);
    });
});

// Ruta para servir el editor basado en school/sector/block
app.get('/editor/:school/:sector/:block', (req, res) => {
    const { school, sector, block } = req.params;
    
    console.log(`Serving editor for: ${school}/${sector}/${block}`);
    
    const htmlPath = path.join(__dirname, 'public', 'block-editor.html');
    
    fs.readFile(htmlPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading HTML file:', err);
            return res.status(500).send('Error loading viewer');
        }

        let modifiedHtml = data
            .replace(/{{school}}/g, school)
            .replace(/{{sector}}/g, sector)
            .replace(/{{block}}/g, block);

        modifiedHtml = modifiedHtml.replace(
            '</head>',
            `<script>
                window.viewerConfig = {
                    school: "${school}",
                    sector: "${sector}", 
                    block: "${block}"
                };
                window.BACKEND_URL = "${process.env.BACKEND_URL}";
                window.CESIUM_TOKEN = "${process.env.CESIUM_TOKEN}";
            </script>
            </head>`
        );

        res.send(modifiedHtml);
    });
});

// Ruta para servir el mapa de escuelas y sectores
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'map.html');
    fs.readFile(htmlPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading map HTML:', err);
            return res.status(500).send('Error loading map');
        }
        const modifiedHtml = data.replace(
            '</head>',
            `<script>
                window.BACKEND_URL = "${process.env.BACKEND_URL}";
            </script></head>`
        );
        res.send(modifiedHtml);
    });
});

// Ruta de healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'frontend' });
});

app.get('/backend', (req, res) => {
    res.json({ backend: process.env.BACKEND_URL});
});

const BACKEND_URL = process.env.BACKEND_URL;
const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Frontend server running on port ${PORT}`);
});