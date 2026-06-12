## Screenshots

### Season Standings

![Season Standings](docs/screenshots/standings-desktop.png)

# Bottoms Up Golf League Manager

A full-stack web application designed to streamline the administration of a recreational golf league.

The system automates weekly score entry, Stableford scoring, handicap calculations, dynamic skins payouts, season standings, and player performance reporting through an intuitive web interface.

Originally developed to solve real-world league administration challenges, the application evolved into a comprehensive league management platform used throughout an active golf season.

---

## Features

### League Administration

* Weekly score entry and validation
* Authentication-protected administrative workflows
* Historical score tracking
* Individual player profiles

### Scoring Engine

* Stableford point calculations
* Gross and net score tracking
* Automatic handicap stroke allocation
* Hole-by-hole scoring summaries

### Dynamic Skins Competition

* Automated skins calculations
* Carryover jackpot support
* Weekly skins reporting
* Participant payout tracking
* Historical skins result navigation

### Reporting

* Season standings leaderboard
* Weekly score summaries
* Player scoring history
* Skins payout reports

---

## Technology Stack

### Backend

* Node.js
* Express.js
* SQLite

### Frontend

* EJS
* Bootstrap 5
* Vanilla JavaScript

### Architecture

* MVC-inspired application structure
* Service layer for business logic
* Controller layer for request orchestration
* Reusable EJS templates and partials

---

## Application Structure

```
routes/
controllers/
services/
views/
middleware/
config/
public/
```

The application separates business rules from presentation concerns through a dedicated service layer, enabling cleaner controllers, improved maintainability, and easier testing.

---

## Screenshots

### Season Standings

*(Add screenshot here)*

### Weekly Score Entry

*(Add screenshot here)*

### Weekly Skins Report

*(Add screenshot here)*

### Player Profile

*(Add screenshot here)*

---

## Getting Started

### Clone the repository

```bash
git clone https://github.com/mthutter/golf-league-site.git

cd golf-league-site
```

### Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Update the values in `.env` as appropriate for your local environment before starting the application.


### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file containing any required configuration values.

### Start the application

```bash
npm start
```

The application will be available at:

```
http://localhost:8080
```

---

## Data Privacy

This repository contains a demonstration dataset intended solely for portfolio purposes.

All participant names, email addresses, phone numbers, and other identifying information have been replaced with fictitious data while preserving the relationships necessary to demonstrate the application's functionality.

No personally identifiable information (PII) from actual league participants is included in this repository.

---

## Future Enhancements

* Enhanced player statistics and analytics
* Exportable reports
* Email notifications and reminders
* Mobile-first UI refinements
* Administrative dashboard enhancements
* Expanded historical reporting capabilities

---

## Project Background

As an active participant in a recreational golf league, I recognized several opportunities to improve the efficiency and accuracy of league administration.

Manual calculations for standings, skins payouts, and historical reporting were time-consuming and prone to error. This application was developed to automate those processes while providing league members with timely access to scoring and performance information.

The project continues to evolve through real-world usage and ongoing feedback from league participants, serving as both a practical tool and an ongoing software engineering exercise in iterative development, refactoring, and feature enhancement.
