# V1.2 Teams + Creator

## Teams
- حجم 1–15 لكل جانب
- queue على team_match_queue بنفس team_size + difficulty
- mode=team · side team_a / team_b
- settle: مجموع نقاط الجانب

## Creator
- is_creator على profiles
- creator_challenges pending → admin approve → challenges bank
- Edge: creator

## Migrations
000022 teams_match_creator
000023 settle_team_mode
