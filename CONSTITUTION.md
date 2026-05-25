# PassReady Finder: System Constitution

## 1. Core Philosophy: "The Lean Intelligence Engine"
- **Objective**: Create high-value business intelligence for minimal operational cost.
- **Priority**: Always use free-tier friendly solutions (FSA, OSM, Gemini Flash).
- **Independence**: Strictly modular. Never edit the main `passready-app` repo.

## 2. Dynamic Segmentation & Targeting
- **Controls**: Dashboard must feature `<input>` for Area and `<select>` for Rating (2, 3, 4, 5).
- **Contextual Drafting**: Gemini prompts must pivot tone based on business rating (2-star: recovery; 4-star: efficiency).
- **Persistence**: Save filters to browser `localStorage` to survive page refreshes.

## 3. Phased Deliverability & Spam Prevention
- **Human-Style Sending**: Randomized delays (5–15 mins) between individual emails.
- **Safety**: No attachments (ever). Use clean HTML links to a landing page or WhatsApp CTA.
- **Bounce Protection**: Lock the "Send Approved" button if bounce rates exceed 2%.
- **Engagement Caps**: Implement 4-touch max per lead; move inactive leads to `nurture` status.

## 4. Engineering Standards
- **Runtime Validation**: Use **Zod** to validate all external API responses at the boundary.
- **Fail-Fast**: If configuration (keys/tokens) is missing, fail immediately.
- **Internal Style**: Keep emails <125 words, no images, lowercase subjects.
