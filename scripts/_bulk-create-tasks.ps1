. "$PSScriptRoot\beads-helpers.ps1"

$tasks = @(
    # Group 1: beads-query.ps1 Full Rewrite (Priority 1)
    @{ title="[query] Define full parameter block"; desc="Define full parameter block: Command, Arg1, Arg2, Status, Description, Priority, Type, Reason, DepType, Limit, Json, Claim"; pri=1; type="task" },
    @{ title="[query] Implement Get-Issues helper"; desc="Read all JSONL lines, deduplicate by id (last-write-wins), return merged issue map"; pri=1; type="task" },
    @{ title="[query] Implement Append-Issue helper"; desc="Serialize hashtable to compact JSON, append to .beads/issues.jsonl"; pri=1; type="task" },
    @{ title="[query] Implement New-IssueId helper"; desc="Generate bd-<4 random base36 chars>, check for collision, retry if needed"; pri=1; type="task" },
    @{ title="[query] Implement list command"; desc="Read all issues, apply optional --status filter and --limit, output human-readable table or --json array"; pri=1; type="task" },
    @{ title="[query] Implement show command"; desc="Find issue by id, print all fields human-readable or as JSON; error + non-zero exit if not found"; pri=1; type="task" },
    @{ title="[query] Implement ready command"; desc="Filter to open/in-progress issues with no unresolved blocks dependencies, sort by priority, apply --limit, output human-readable or --json"; pri=2; type="task" },
    @{ title="[query] Implement search command"; desc="Case-insensitive substring match on title + description, output matching issues human-readable or --json"; pri=2; type="task" },
    @{ title="[query] Implement create command"; desc="Build new issue record with generated id and all provided fields, append to JSONL, print id or --json object"; pri=1; type="task" },
    @{ title="[query] Implement update command"; desc="Read current issue, build delta record with changed fields (status, priority, claimed_by for --claim), append delta, print confirmation or --json object"; pri=1; type="task" },
    @{ title="[query] Implement close command"; desc="Append delta with status=closed and close_reason, print confirmation or --json object"; pri=1; type="task" },
    @{ title="[query] Implement dep add subcommand"; desc="Read current dependencies, add new entry, append full updated dependencies array as delta record"; pri=2; type="task" },
    @{ title="[query] Implement dep list subcommand"; desc="Print all dependencies for the issue"; pri=2; type="task" },
    @{ title="[query] Implement dep remove subcommand"; desc="Read current dependencies, remove matching entry, append updated array as delta record"; pri=2; type="task" },
    @{ title="[query] Implement stats command"; desc="Compute totals by status and priority, output human-readable summary or --json object"; pri=2; type="task" },
    @{ title="[query] Add usage/help output"; desc="Output help for unknown command or bare invocation (exit 0)"; pri=3; type="task" },
    @{ title="[query] Ensure stderr/stdout separation"; desc="All error messages go to stderr (Write-Error); all data output goes to stdout"; pri=2; type="task" },
    @{ title="[query] Handle empty issues.jsonl gracefully"; desc="Verify empty .beads/issues.jsonl is handled gracefully (no errors, empty output)"; pri=2; type="task" },

    # Group 2: beads-helpers.ps1 Full Rewrite (Priority 1-2)
    @{ title="[helpers] Define bd function with PSScriptRoot resolution"; desc="Define bd function using PSScriptRoot to resolve beads-query.ps1 path; use hashtable splatting for reliable param binding; propagate exit code"; pri=1; type="task" },
    @{ title="[helpers] Rewrite bd-list-open"; desc="Call bd list --status open"; pri=2; type="task" },
    @{ title="[helpers] Rewrite bd-list-all"; desc="Call bd list"; pri=2; type="task" },
    @{ title="[helpers] Rewrite bd-show"; desc="Call bd show Id"; pri=2; type="task" },
    @{ title="[helpers] Add bd-ready function"; desc="Calls bd ready"; pri=2; type="task" },
    @{ title="[helpers] Add bd-create function"; desc="Accepts Title, optional -Description, -Priority, -Type; calls bd create"; pri=1; type="task" },
    @{ title="[helpers] Add bd-update function"; desc="Accepts Id, optional -Status, -Claim switch, -Priority; calls bd update"; pri=1; type="task" },
    @{ title="[helpers] Add bd-close function"; desc="Accepts Id, optional -Reason; calls bd close"; pri=1; type="task" },
    @{ title="[helpers] Add bd-search function"; desc="Accepts Query; calls bd search"; pri=2; type="task" },
    @{ title="[helpers] Add bd-dep function"; desc="Splats args to bd dep"; pri=2; type="task" },
    @{ title="[helpers] Refactor bd-list-augext"; desc="Call bd show + bd list instead of inline JSONL parsing"; pri=3; type="task" },
    @{ title="[helpers] Refactor bd-list-charcount"; desc="Call bd show + bd list instead of inline JSONL parsing"; pri=3; type="task" },
    @{ title="[helpers] Update bd-help"; desc="List all new functions; remove any references to bd.exe or dolt"; pri=2; type="task" },
    @{ title="[helpers] Fix dot-source detection"; desc="Use MyInvocation.InvocationName -eq '.' for reliable dot-source detection"; pri=2; type="task" },
    @{ title="[helpers] Remove Export-ModuleMember call"; desc="Scripts are dot-sourced, not imported as modules; remove Export-ModuleMember"; pri=2; type="task" },

    # Group 3: Cleanup
    @{ title="[cleanup] Remove bd.exe references"; desc="Remove any remaining bd.exe references from scripts, helper text, and bd-help output"; pri=2; type="task" },
    @{ title="[cleanup] Remove dolt server references"; desc="Remove any dolt server references from scripts and helper text"; pri=2; type="task" },
    @{ title="[cleanup] Verify .beads/config.json reading"; desc="Verify .beads/config.json is read correctly (project name, version)"; pri=3; type="task" },
    @{ title="[cleanup] Full lifecycle smoke test"; desc="Dot-source helpers, run bd list, bd create, bd show, bd update --claim, bd close --reason done, bd stats"; pri=1; type="task" }
)

Write-Host "Creating $($tasks.Count) beads issues..."
$created = 0
foreach ($t in $tasks) {
    bd create $t.title -Description $t.desc -Priority $t.pri -Type $t.type
    $created++
}
Write-Host ""
Write-Host "Done. Created $created issues."
Write-Host ""
bd stats

