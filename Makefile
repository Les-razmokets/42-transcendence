# Project name
NAME = transcendence

# Directories
BACKDIR = backend

# Commands
COMPOSE = docker compose
PRISMA = cd $(BACKDIR) && npx prisma

# Colors
GREEN = \033[0;32m
CYAN = \033[0;36m
YELLOW = \033[0;33m
RED = \033[0;31m
RESET = \033[0m

define spin
	@printf "$(CYAN)$(1)$(RESET)  "; \
	log=$$(mktemp); \
	( $(2) ) > $$log 2>&1 & pid=$$!; \
	while kill -0 $$pid 2>/dev/null; do \
		for f in ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏; do \
			printf "\b$$f"; sleep 0.08; \
			kill -0 $$pid 2>/dev/null || break; \
		done; \
	done; \
	wait $$pid; rc=$$?; \
	if [ $$rc -eq 0 ]; then \
		printf "\b$(GREEN)✓$(RESET)\n"; rm -f $$log; \
	else \
		printf "\b$(RED)✗$(RESET)\n"; cat $$log; rm -f $$log; exit $$rc; \
	fi
endef

# Rules
all: $(BACKDIR)/node_modules up deploy
	@echo "$(GREEN)🎉 $(NAME) ready! 🎉$(RESET)"

$(BACKDIR)/node_modules: $(BACKDIR)/package-lock.json
	$(call spin,📦 Installing backend dependencies...,npm ci --prefix $(BACKDIR))

up:
	$(call spin,🐳 Starting containers...,$(COMPOSE) up -d --wait)

down:
	$(call spin,🛑 Stopping containers...,$(COMPOSE) down)

ps:
	@$(COMPOSE) ps

logs:
	@$(COMPOSE) logs -f

# Applique les migrations existantes (non interactif)
deploy:
	$(call spin,🗄️  Applying migrations...,$(PRISMA) migrate deploy)

# Cree une nouvelle migration : make migrate name=add_casino
migrate:
	@$(PRISMA) migrate dev $(if $(name),--name $(name))

studio:
	@$(PRISMA) studio

clean: down

# ⚠️ Supprime aussi le volume : toutes les donnees de la base sont perdues
fclean:
	$(call spin,🧨 Removing containers and volumes...,$(COMPOSE) down -v --remove-orphans)
	@echo "$(CYAN)✓ Database volume removed$(RESET)"

re: fclean all

help:
	@echo "$(CYAN)═══════════════════════════════════════════════════════$(RESET)"
	@echo "$(GREEN)  Transcendence Makefile - Available targets$(RESET)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════$(RESET)"
	@echo "  $(YELLOW)all$(RESET)       - Install deps, start containers, apply migrations"
	@echo "  $(YELLOW)up$(RESET)        - Start containers (waits for healthy)"
	@echo "  $(YELLOW)down$(RESET)      - Stop containers"
	@echo "  $(YELLOW)ps$(RESET)        - Show containers status"
	@echo "  $(YELLOW)logs$(RESET)      - Follow containers logs"
	@echo "  $(YELLOW)deploy$(RESET)    - Apply existing migrations"
	@echo "  $(YELLOW)migrate$(RESET)   - Create a migration (name=<migration_name>)"
	@echo "  $(YELLOW)studio$(RESET)    - Open Prisma Studio"
	@echo "  $(YELLOW)clean$(RESET)     - Same as down"
	@echo "  $(YELLOW)fclean$(RESET)    - Stop containers and DELETE database volume"
	@echo "  $(YELLOW)re$(RESET)        - fclean + all"
	@echo "  $(YELLOW)help$(RESET)      - Show this help message"
	@echo "$(CYAN)═══════════════════════════════════════════════════════$(RESET)"

.PHONY: all up down ps logs deploy migrate studio clean fclean re help
