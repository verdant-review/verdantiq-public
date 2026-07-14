# VerdantIQ – AI-Powered Agricultural Intelligence Platform

##

---

# 1. Problem Statement

Agricultural institutions across Africa operate with fragmented information systems that limit their ability to make timely, data-driven decisions. Weather forecasts, farm records, satellite imagery, market information and agronomic knowledge often exist in disconnected systems, making it difficult to provide coordinated advisory services, monitor agricultural programmes and respond effectively to climate risks.

Smallholder farmers are most affected by this fragmentation, receiving delayed or inconsistent advice while institutions struggle to monitor productivity and agricultural outcomes at scale.

**VerdantIQ addresses this challenge by transforming fragmented agricultural data into actionable intelligence through artificial intelligence.**

### Target Users

**Primary Customers**

* Government agricultural agencies
* Agricultural NGOs
* Agribusinesses
* Commercial farming enterprises
* Producer organisations and cooperatives

**End Users**

* Farmers
* Extension officers
* Agronomists
* Programme managers
* Field coordinators

---

# 2. Solution

VerdantIQ is an AI-powered agricultural intelligence platform that combines agricultural knowledge, geospatial intelligence and frontier AI models to support decision-making across the agricultural value chain.

The current platform includes:

* AI Agronomist
* AI-assisted Crop Disease Detection
* Farm Management
* Weather Intelligence
* Market Intelligence
* Enterprise Analytics

Rather than replacing existing agricultural workflows, VerdantIQ integrates with institutional operations to improve advisory services, crop monitoring and operational visibility.

---

# 3. Demonstration

### Live Application

https://verdant.co.zw

### Demonstration Features

* AI Agronomist
* Disease Detection
* Farm Dashboard
* Weather Intelligence
* Market Information
* Enterprise Dashboard
* WhatsApp Interface

### Supporting Documentation

* Pitch Deck
* Product Validation Report
* AI Architecture
* Deployment Plan

---

# 4. System Architecture

## Platform Architecture

```text
Weather API
Geospatial Data
Farm Records
Crop Images
Agricultural Datasets
Public Market Information

                │
                ▼

      VERDANTIQ INTELLIGENCE LAYER

                │
                ▼

     Agricultural Intelligence Engine

                │
                ▼

      Personalised Recommendations

                │
                ▼

 Farmer & Enterprise Decision Making

                │
                ▼

        Continuous Learning Loop
```

---

## AI Architecture

```text
Knowledge Base
Farm Database
External Data APIs

            │
            ▼

VerdantIQ Intelligence Layer

• Context Retrieval
• Business Rules
• Agricultural Intelligence
• Decision Engine

            │
            ▼

Gemini 2.5 Flash

            │
            ▼

Recommendations & Insights
```

---

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui

### Backend

* Supabase
* PostgreSQL
* Edge Functions

### AI

* Gemini 2.5 Flash
* Retrieval-Augmented Generation (RAG)

### Infrastructure

* Cloud-hosted Software-as-a-Service (SaaS)

---

# 5. Data Sources

VerdantIQ combines multiple sources of agricultural information to provide context-aware recommendations.

| Data Source                 | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| Farm Records                | Farm management and operational history         |
| Weather APIs                | Weather forecasts and climate information       |
| Geospatial Data             | Vegetation monitoring and location intelligence |
| Crop Images                 | AI-assisted disease identification              |
| Agricultural Knowledge Base | Agronomic guidance and best practices           |
| Public Market Information   | Commodity reference prices                      |
| Agricultural Datasets       | Historical production and yield analysis        |

## Data Governance

* Customer data remains the property of the deploying organisation.
* Market information is sourced from publicly available reference data and verified before publication.
* Personally identifiable information is minimised wherever possible.
* Data access is controlled using role-based permissions.

---

# 6. AI Method

VerdantIQ uses **Gemini 2.5 Flash** as its primary foundation model within a modular AI architecture.

Rather than relying solely on the foundation model, VerdantIQ applies Retrieval-Augmented Generation (RAG) to provide context-aware agricultural recommendations.

### AI Workflow

1. User submits a request.
2. Relevant farm information is retrieved.
3. Agricultural knowledge is retrieved from the Knowledge Base.
4. Weather, geospatial and market context are added.
5. Gemini 3.5 Flash generates a response.
6. VerdantIQ returns recommendations grounded in agricultural context.

### Current AI Capabilities

* Agronomic advisory
* Disease identification
* Context-aware recommendations
* Agricultural question answering
* Farm management support

### Responsible AI

VerdantIQ is designed to augment human expertise rather than replace it.

AI recommendations are intended as decision-support guidance and should be used alongside professional judgement where appropriate.

---

# 7. Local Setup

## Prerequisites

* Node.js 18+
* npm
* Git
* Supabase project

## Installation

```bash
git clone <https://github.com/nhemaz360/verdantiq-agro-vista>

cd verdantiq

npm install
```

Create a local environment file.

```bash
cp .env.example .env
```

Configure the required environment variables.

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
```

Start the development server.

```bash
npm run dev
```

The application will be available locally at:

```
http://localhost:8080
```

---

# 8. Testing

VerdantIQ currently follows a structured manual acceptance testing process.

Core functionality validated includes:

* User authentication
* Farm management
* AI Agronomist
* Disease detection
* Weather integration
* Market information
* WhatsApp Interface
* Enterprise dashboard
* Geospatial data

Known issues and planned improvements are documented separately.

**Automated tests included in this release**
Two lightweight test suites ship with the codebase to give reviewers a quick health signal without needing a live database:
•	tests/unit/mechanization-score.test.ts — pure function checks for the mechanization score bands used on the farm dashboard and in the ministry report.
•	tests/unit/responsible-ai.test.ts — asserts that the shared Responsible-AI guardrails contain the required transparency, attribution, safety-scope and locality clauses so no accidental prompt change can quietly disable them.

**Running the tests**
npm install
npm test
Vitest runs both suites in under a second. Add --watch during development.


---

# 9. Deployment

VerdantIQ is deployed as a cloud-hosted SaaS platform.

Deployment includes:

* Secure authentication
* Managed PostgreSQL database
* Serverless backend services
* Enterprise data isolation
* HTTPS encryption
* Continuous platform updates

No specialised hardware is required.

Users access the platform through a modern web browser.

---

# 10. Known Limitations

Current platform limitations include:

* While the WhatsApp integration via Twilio is intended to let users interact with the broader VerdantIQ platform, the reasoning layer sometimes fails to trigger the correct functions because it misinterprets or loses context entirely.
* Offline functionality is planned for future releases.
* Yield prediction is undergoing redevelopment using an improved machine learning approach. (Github Link: )
* Recommendation quality depends on the availability and quality of contextual agricultural data.
* Market information currently relies on verified public reference sources and administrative validation.

These limitations form part of VerdantIQ's product roadmap and are being addressed through ongoing development and institutional pilot deployments.

---

# 11. Team

### Cliff Nhemachena

**Founder & CEO**

Leads product strategy, artificial intelligence development and long-term company vision.

### Hope Mazungunye

**Chief Agronomist**

Leads agronomic strategy and ensures VerdantIQ's intelligence is grounded in rigorous agricultural science and evidence-based practices.

### Lisa Mutenure

**Head of Growth & Partnerships**

Leads strategic partnerships, customer engagement and institutional growth.



---

# License

Copyright © Zyterra.
