ifneq (,$(wildcard ./.env))
	include .env
	export
endif

.PHONY: all

frontdev:
	@cd front && pnpm dev

backdev:
	@cd back && cargo watch -x run

dev:
	@make -j2 frontdev backdev
