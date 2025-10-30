# OpenPedra - 3D Boulder Climbing Guide Platform 🧗‍♂️

## Overview 🗺️
OpenPedra is a platform born to democratize access to creating interactive 3D climbing guides and topos, enabling route developers and communities who maintain the sectors we all enjoy to publish, document, and share their routes without needing to develop complex software or tools.

## Why OpenPedra Exists ⛰️
Many route developers have valuable stories, beta, and local knowledge, but lack easy tools to share boulder problems in formats that go beyond edited photographs. OpenPedra makes it easy to:
- 🎯 Create 3D guides from simple files and data
- 📝 Maintain authorship and control over route information

## 🗂️ How to Upload 3D Models

### 🎮 Interactive Block Editor
You can also create and edit problems using the interactive block editor:

- 🎯 **Visual problem creation** directly on the 3D model
- 🤖 **Automatic metadata generation**
- 👁️ **Live preview** of routes on the boulder

### 🔄 Automatic Synchronization

When you add new models:

1. 📁 Place files in the correct folder structure
2. 🔄 Run the sync command or restart the application
3. 🤖 The system automatically:
   - 🏫 Detects new schools/sectors/blocks
   - 📐 Imports 3D model geometries
   - 📊 Loads problem data from JSON files
   - 🗺️ Updates spatial indexes

```
3dmodels/
├── 📁 school 1/
│   ├── 📁 sector 1/
│   │   ├── 📁 block 1/
│   │   │   ├── 🎯 tileset.json
│   │   │   ├── 📄 problems.json
│   │   │   └── 📁 tiles/
│   │   │       ├── 0/0/0/0.glb
│   │   │       └── subtrees/
│   │   └── 📁 block 2/
│   │       ├── 🎯 tileset.json
│   │       ├── 📄 problems.json
│   │       └── 📁 tiles/
│   │           ├── 0/0/0/0.glb
│   │           └── subtrees/
│   └── 📁 sector 2/
│       ├── 📁 block 1/
│       │   ├── 🎯 tileset.json
│       │   ├── 📄 problems.json
│       │   └── 📁 tiles/
│       │       ├── 0/0/0/0.glb
│       │       └── subtrees/
│       └── 📁 block 2/
│           ├── 🎯 tileset.json
│           ├── 📄 problems.json
│           └── 📁 tiles/
│               ├── 0/0/0/0.glb
│               └── subtrees/
...
└── 📁 school n/
    └── 📁 sector n/
        └── 📁 block n/
            ├── 🎯 tileset.json
            ├── 📄 problems.json
            └── 📁 tiles/
                ├── 0/0/0/0.glb
                └── subtrees/
```
The system will automatically create the corresponding schools, sectors, and blocks in the database with their 3D geometries and climbing problems! 🎉

## Key Features ✨
- 🎯 3D model import and visualization
- 📋 Comprehensive route documentation
- 🗺️ Interactive topo generation
- 👤 Control over publication and credit for sector development

## Project Structure & Core Setup 🏗️

### **Backend Services**
- 🐍 **FastAPI** with PostgreSQL + PostGIS integration
- ⚡ **Async database operations** with SQLAlchemy 2.0
- 🔐 **JWT authentication** system for user management
- 🔄 **3D model synchronization** from file system to database
- 🌐 **GeoJSON API endpoints** for spatial data

### **Frontend Architecture** 
- 🟢 **Node.js server** for static file serving
- 🗺️ **CesiumJS integration** for 3D visualization
- 📱 **Responsive design** for mobile and desktop
- 🔌 **REST API integration** with backend services

### **Database & Spatial Features**
- 🐘 **PostgreSQL 16** with PostGIS 3.4 extension
- 📍 **Spatial data management** for climbing locations
- 📐 **Automatic geometry processing** from 3D model coordinates
- 🔷 **Convex hull calculations** for area definitions

### **Docker Infrastructure**
- 🐳 **Multi-container setup** with Docker Compose
- ❤️ **Health checks** and dependency management
- 💾 **Volume persistence** for database data
- 🌐 **Network isolation** between services

## 🚀 Key Features Implemented

### **Core Functionality**
- ✅ 3D boulder problem management system 
- ✅ School/Sector/Block hierarchical organization 
- ✅ Automatic database synchronization from file structure 
- ✅ Spatial queries and GeoJSON API endpoints 
- ✅ User authentication and authorization 

### **Development Setup**
- ✅ Poetry for Python dependency management 
- ✅ Alembic for database migrations 
- ✅ Environment-based configuration 
- ✅ Hot-reload development environment 


## 📁 Project Structure
```
OpenPedra/
├── 3dmodels/ # 3D tilesets and models
├── backend/ # FastAPI application
├── frontend/ # Node.js static server
├── docker-compose.yml # Multi-service orchestration
├── .env.example # Environment template
└── README.md # Project documentation
```

## 🎯 Getting Started

### Clone and setup
```bash
git clone https://github.com/vicnavzu/OpenPedra.git
cd OpenPedra
```

### Configure environment
```bash
cp .env.example .env
# Edit .env with your configuration ⚙️
```

### Start services
```bash
docker compose up --build
```

### Access applications
- **Backend API**: http://localhost:10000
- **Frontend**: http://localhost:8080
- **Database**: localhost:5433

## Contact 📞

To contribute, report bugs, or request features: open issues in the repository.

## License 📜

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)