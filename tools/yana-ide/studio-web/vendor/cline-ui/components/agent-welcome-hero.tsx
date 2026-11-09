"use client";

/*
 * MODIFIED by Yana AI (2026-11-06) from cline/cline sdk/packages/ui, commit
 * d3ecc4890e8f9bcb77182b96c77fa90575e8e145 (Apache-2.0).
 * The Cline robot illustration (five layers: inner, bot-fill, bot-outline, two eyes) is replaced by
 * the Yana rabbit logo. Cline's name and artwork are not used. The grid backdrop and the pointer
 * tracking hook are unchanged, but tracking is now off by default so the logo does not move.
 * Props keep their upstream names; variant "bot-only" now means "rabbit only".
 */

import { useRef } from "react";
import rabbitUrl from "../../../assets/yana-rabbit.svg?inline";
import { useAgentWelcomeHeroPointer } from "./agent-welcome-hero-pointer.js";

export type AgentWelcomeHeroLayout = "default" | "full-bleed" | "wide-grid";

export interface AgentWelcomeHeroProps {
	interactive?: boolean;
	layout?: AgentWelcomeHeroLayout;
	variant?: "full" | "grid-only" | "bot-only";
}

/** Yana rabbit logo and grid backdrop used on welcome surfaces. */
export function AgentWelcomeHero({
	interactive,
	layout = "default",
	variant = "full",
}: AgentWelcomeHeroProps) {
	const heroRef = useRef<HTMLDivElement>(null);
	const showsGrid = variant !== "bot-only";
	const showsRabbit = variant !== "grid-only";
	// Yana: the logo stays still. Pointer tracking (upstream default) is off unless a caller asks for it.
	const tracksPointer = interactive ?? false;
	useAgentWelcomeHeroPointer(heroRef, tracksPointer);

	return (
		<div
			aria-hidden="true"
			className="cline-ui-agent-welcome-hero"
			data-welcome-hero
			data-welcome-hero-interactive={tracksPointer}
			data-welcome-hero-layout={layout}
			data-welcome-hero-variant={variant}
			ref={heroRef}
		>
			{showsGrid ? (
				<div
					className="cline-ui-agent-welcome-hero__grid"
					data-welcome-hero-layer="grid"
				/>
			) : null}
			{showsRabbit ? (
				<img
					alt=""
					className="cline-ui-agent-welcome-hero__rabbit"
					data-welcome-hero-layer="rabbit"
					draggable={false}
					src={rabbitUrl}
				/>
			) : null}
		</div>
	);
}
