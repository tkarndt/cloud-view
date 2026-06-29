# CLAUDE.md

## When coding:
- Always work test driven.
- Always output unit tests and suggest reasonable integration tests.
- Avoid mocking but rather implement easy to test architecture instead (e.g. by dependency injection, avoiding side effects, pushing IO to the boundaries)
- Always use type annotation when using dynamically typed languages.
- Always write docstrings
- Add sparse logging for info and verbose logging for debugging
- Always include automated CI/CD steps for testing, linting, formatting, and type checking.
- Make sure to include a README.md with instructions for setting up the development environment, running tests, and starting the application.
- Use docker compose for full stack development and for integration testing, if applicable.
- Avoid suggesting multiple ways to do the same thing, instead suggest a single best practice way to do it.

## When coding in python:
- Always use pytest for unit and integration tests.
- setup black in the ci tool chain to enforce code formatting.
- setup flake8 in the ci tool chain to enforce code linting.
- setup mypy in the ci tool chain to enforce type checking.
- add an easy-to-use single command setup script for developers to install all dependencies with uv

## For frontend tasks:
- use TypeScript