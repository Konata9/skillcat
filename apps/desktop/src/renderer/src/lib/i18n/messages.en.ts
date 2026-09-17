import type { MessageKey } from './messages.zh';
import type { MessageValue } from './types';

export const en: Record<MessageKey, MessageValue> = {
  // ---- app shell ----
  'app.ready': 'Ready',
  'app.scanning': 'Scanning…',
  'app.scannedAt': 'Scanned {time}',
  'app.cliAvailable': 'CLI available',
  'app.cliUnavailable': 'CLI unavailable',
  'app.conflictsCount': 'Conflicts {count}',
  'app.cliUnavailableBanner': 'skills CLI is unavailable: {error}',
  'app.noRootsBanner': 'No scan roots yet; project-level skills will not be discovered.',
  'app.goToSettings': 'Open settings',
  'app.refresh': 'Refresh',
  'app.deepRefresh': 'Deep refresh',
  'app.updateAll': 'Update all',
  'app.scopeHeading': 'Scopes',
  'app.scopeSummary': '{label} · {count}',
  'app.themeToDark': 'Switch to dark theme',
  'app.themeToLight': 'Switch to light theme',
  'app.localeSwitch': '切换到中文',

  // ---- navigation ----
  'nav.skills': 'Skills',
  'nav.conflicts': 'Conflicts',
  'nav.projects': 'Projects',
  'nav.search': 'Search',
  'nav.settings': 'Settings',

  // ---- shared ----
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.add': 'Add',
  'common.save': 'Save',
  'scope.global': 'Global',
  'scope.project': 'Project: {name}',
  'time.unknown': '—',
  'time.justNow': 'just now',
  'time.minutesAgo': { one: '{n} minute ago', other: '{n} minutes ago' },
  'time.hoursAgo': { one: '{n} hour ago', other: '{n} hours ago' },
  'time.daysAgo': { one: '{n} day ago', other: '{n} days ago' },
  'time.monthsAgo': { one: '{n} month ago', other: '{n} months ago' },
  'time.yearsAgo': { one: '{n} year ago', other: '{n} years ago' },

  // ---- status messages ----
  'status.opFailed': 'Operation failed: {message}',
  'status.annotationSaved': 'Trigger annotations saved',
  'status.saveFailed': 'Save failed: {message}',
  'status.projectRemoved': 'Project unregistered (no files were deleted)',
  'status.projectAdded': 'Project added: {path}',
  'status.projectsRescanned': 'Projects rediscovered',
  'status.settingsSaved': 'Settings saved and refreshed',
  'status.doctorOk': 'Doctor finished: no issues found',
  'status.doctorWarnings': {
    one: 'Doctor finished: {n} warning',
    other: 'Doctor finished: {n} warnings',
  },

  // ---- confirm dialogs ----
  'confirm.removeSkill.title': 'Remove skill',
  'confirm.removeSkill.body': 'Remove {name} ({scope}) and all of its agent links?',
  'confirm.removeSkill.confirm': 'Remove',
  'confirm.update.title': 'Update skill',
  'confirm.update.body': 'Update {name} to the latest version via npx skills.',
  'confirm.update.source': 'Source: {source}',
  'confirm.update.noLock': 'This skill has no lock entry; updating may have no effect.',
  'confirm.update.confirm': 'Update',
  'confirm.updateAll.title': 'Update all',
  'confirm.updateAll.body': 'Update every skill in {label}.',
  'confirm.install.title': 'Install skill',
  'confirm.install.body': 'Install {package} into {label} and link all skills to all agents.',
  'confirm.install.confirm': 'Install',
  'confirm.projectRemove.title': 'Unregister project',
  'confirm.projectRemove.body': 'Unregister {name}? No files on disk will be deleted.',
  'confirm.projectRemove.confirm': 'Unregister',

  // ---- skill list ----
  'skillList.empty': 'No skills in this scope yet',
  'skillList.emptyFiltered': 'No matching skills',
  'skillList.noDescription': '(no description)',
  'skillList.manual': 'Manual',
  'skillList.updated': 'Updated {time}',
  'badge.manual': 'manual',
  'badge.internal': 'internal',
  'badge.dangling': 'dangling',
  'badge.user': 'user',
  'badge.removed': 'removed',

  // ---- skill detail ----
  'detail.open': 'Open SKILL.md',
  'detail.reveal': 'Reveal in Finder',
  'detail.editTriggers': 'Edit triggers',
  'detail.update': 'Update',
  'detail.remove': 'Remove',
  'detail.bodyTruncated': 'Body truncated',
  'detail.metaInstalled': 'Installed',
  'detail.metaUpdated': 'Updated',
  'detail.metaHash': 'Content hash',
  'detail.metaSize': 'Size',
  'detail.sizeValue': { one: '{bytes} / {n} file', other: '{bytes} / {n} files' },
  'detail.description': 'Description',
  'detail.triggerProfile': 'Trigger profile',
  'detail.links': 'Links',
  'detail.linkSummary':
    'canonical {canonical} · symlink {symlink} · missing {missing} · copy {copy} · dangling {dangling}',
  'detail.files': 'Files ({count})',
  'detail.filesMore': { one: '…and {n} more file', other: '…and {n} more files' },
  'detail.body': 'Body',

  // ---- triggers panel ----
  'triggers.positive': 'Positive triggers ({count})',
  'triggers.negative': 'Negative exclusions ({count})',
  'triggers.intents': 'Intents ({count})',
  'triggers.none': 'None',
  'triggers.noSignal':
    'No “when to use” signal detected: agents may never auto-load this skill.',

  // ---- trigger editor ----
  'editor.title': 'Edit trigger annotations · {name}',
  'editor.hint':
    'Annotations live in a sidecar file in the config directory; skill files are never modified. Annotations expire when skill content changes.',
  'editor.positive': 'Positive',
  'editor.negative': 'Negative',
  'editor.placeholder': 'New trigger, e.g. weekly report',
  'editor.empty': 'No triggers to edit',
  'editor.remove': 'Remove',
  'editor.restore': 'Restore',
  'editor.disable': 'Disable',

  // ---- operation drawer ----
  'op.done': 'Done',
  'op.failed': 'Failed',
  'op.running': 'Running…',
  'op.waiting': 'Waiting for output…',

  // ---- skills view ----
  'skills.filterPlaceholder': 'Filter by name / description / trigger / source',
  'skills.selectHint': 'Select a skill to see its details',

  // ---- conflicts view ----
  'conflicts.severity.error': 'Errors',
  'conflicts.severity.warn': 'Warnings',
  'conflicts.severity.info': 'Info',
  'conflicts.all': 'All {count}',
  'conflicts.deterministic': 'Deterministic',
  'conflicts.heuristic': 'Heuristic',
  'conflicts.similarity': 'Similarity {value}%',
  'conflicts.detailHeading': 'Details',
  'conflicts.suggestionHeading': 'Suggestion',
  'conflicts.evidenceHeading': 'Evidence',
  'conflicts.skillsHeading': 'Related skills',
  'conflicts.emptyLevel': 'No conflicts at this level',
  'conflicts.selectHint': 'Select a conflict to see its details',
  'conflicts.skillScope': '{name} ({scope})',

  // ---- projects view ----
  'projects.summary': {
    one: '{n} project (auto-discovered under scan roots; pinned first)',
    other: '{n} projects (auto-discovered under scan roots; pinned first)',
  },
  'projects.add': 'Add project',
  'projects.rescan': 'Rediscover',
  'projects.empty':
    'No projects yet. Add scan roots in Settings, or add a project manually.',
  'projects.tableProject': 'Project',
  'projects.tablePath': 'Path',
  'projects.tableSkills': 'skills',
  'projects.tableMarkers': 'Markers',
  'projects.registered': 'Registered',
  'projects.scanError': 'Scan error',
  'projects.pin': 'Pin',
  'projects.unpin': 'Unpin',
  'projects.unregister': 'Unregister',

  // ---- search view ----
  'search.placeholder': 'Search skills.sh, e.g. code review',
  'search.button': 'Search',
  'search.searching': 'Searching…',
  'search.emptyHint': 'Search public skills by keyword. Installs run through npx skills.',
  'search.noResults': 'No results, or remote search is unavailable.',
  'search.tableSkill': 'skill',
  'search.tableSource': 'Source',
  'search.tableInstalls': 'Installs',
  'search.install': 'Install',

  // ---- settings view ----
  'settings.languageLabel': 'Language',
  'settings.languageHint': 'Defaults to the system language',
  'settings.rootsLabel': 'Scan roots (one per line, used to discover projects)',
  'settings.pickDirectory': 'Choose folder…',
  'settings.rootsHint': 'Up to {depth} levels deep; node_modules / .git and similar are skipped',
  'settings.overlapLabel': 'Trigger overlap threshold (0–1, default 0.3)',
  'settings.duplicateLabel': 'Body duplicate threshold (0–1, default 0.5)',
  'settings.commandLabel': 'skills CLI command override (blank = auto-detect npx)',
  'settings.proxyLabel': 'Network proxy (for npx skills downloads and updates)',
  'settings.proxyEnable': 'Enable proxy',
  'settings.proxyUrlLabel': 'Proxy address (host and port)',
  'settings.proxyHint': 'http / https / socks supported, e.g. 127.0.0.1:7890',
  'settings.proxyActive': 'Effective: {url}',
  'settings.proxyInvalid': 'Proxy URL is invalid and will be ignored',
  'settings.proxyBypassLabel': 'Bypass list (optional, comma-separated)',
  'settings.doctorProxy': 'Proxy: {url}',
  'settings.doctorProxyNone': 'Proxy: not configured',
  'settings.cliAvailable': 'Available ({source})',
  'settings.cliUnavailable': 'Unavailable',
  'settings.showInternal': 'Show internal skills',
  'settings.save': 'Save & refresh',
  'settings.runDoctor': 'Run doctor',
  'settings.runningDoctor': 'Running…',
  'settings.doctorHeading': 'Doctor',
  'settings.doctorCli': 'CLI: {command}',
  'settings.doctorCliVersion': 'CLI: {command} (v{version})',
  'settings.doctorCliUnset': 'not configured',
  'settings.doctorConfigDir': 'Config dir: {path}',

  // ---- doctor warnings ----
  'doctor.noRoots': 'No scan roots configured yet',
  'doctor.invalidProxy': 'Proxy URL is invalid ({url}); ignored',
  'doctor.cliUnavailable': 'skills CLI is unavailable ({error})',
  'doctor.cliVersionFailed': 'skills CLI exists but could not run --version',

  // ---- findings ----
  'finding.danglingLink.title': 'Dangling {agent} link for {name}',
  'finding.danglingLink.detail':
    '{path} points to a missing target ({target}); this agent cannot load the skill.',
  'finding.danglingLink.suggestion': 'Reinstall or remove the dangling link: {command}',
  'finding.dirMissingLock.title': '{name} has no lock entry (manually maintained)',
  'finding.dirMissingLock.detail':
    'This skill exists in the skills directory but not in the lock file, so npx skills update will not update it.',
  'finding.dirMissingLock.suggestion':
    'To bring it under CLI management, reinstall with npx skills add <source>; otherwise ignore.',
  'finding.copyDrift.title': '{name} {agent} copy drifted from source',
  'finding.copyDrift.detail':
    'This agent directory uses a copy instead of a symlink, and the copy has diverged from the canonical directory.',
  'finding.copyDrift.suggestion':
    'Delete the copy and reinstall, or switch to symlink installs everywhere.',
  'finding.localModifiedHash.title': '{name} content differs from install time',
  'finding.localModifiedHash.detail':
    'The directory hash does not match the lock file; the next npx skills update will overwrite local changes.',
  'finding.localModifiedHash.suggestion': 'Back up or commit your changes if you want to keep them.',
  'finding.localModifiedScan.title': '{name} changed since the last scan',
  'finding.localModifiedScan.detail':
    'GitHub-sourced skills store a git tree hash, which cannot be compared locally; this detects changes since skillman last scanned.',
  'finding.localModifiedScan.suggestion':
    'If this was a manual edit, back it up before updating.',
  'finding.declaredLinkMissing.title': {
    one: '{agent} is missing a link for {count} declared skill',
    other: '{agent} is missing links for {count} declared skills',
  },
  'finding.declaredLinkMissing.detail':
    'npx skills reports these skills as installed for {agent}, but the directory has no links or copies.',
  'finding.declaredLinkMissing.suggestion':
    'Reinstall to fill the gaps, or drop the agent from the declaration (npx skills add <source> -a {agentId}).',
  'finding.declaredLinkMissing.suggestionNoAgent': 'Reinstall to restore the links.',
  'finding.descriptionLint.title': '{name} has incomplete trigger info',
  'finding.descriptionLint.detail': '{reasons}',
  'finding.descriptionLint.suggestion':
    'Add an “Use when …” clause to the description or a when_to_use field.',
  'finding.descriptionLint.missingDescription': 'missing description',
  'finding.descriptionLint.shortDescription': 'description too short',
  'finding.descriptionLint.noWhenSignal':
    'no “when to use” signal in description/body; agents may never auto-load it',
  'finding.lockMissingDir.title': '{name} has a lock entry but no directory',
  'finding.lockMissingDir.detail':
    'The lock file records this skill from {source}, but {path} does not exist.',
  'finding.lockMissingDir.suggestion':
    'Run npx skills update {name} or reinstall to restore it.',
  'finding.shadowing.title': 'Project-level {name} shadows the global version',
  'finding.shadowing.detail':
    'The same skill name exists globally and in a project; agents usually prefer the project-level version.',
  'finding.shadowing.suggestion': 'Confirm this is intentional; otherwise remove one of them.',
  'finding.sourceConflict.title': '{name} exists with different sources',
  'finding.sourceConflict.detail':
    'Global comes from {globalSource}, project comes from {projectSource}. Most agents prefer the project-level version.',
  'finding.sourceConflict.suggestion': 'Confirm this is intentional; otherwise remove one of them.',
  'finding.triggerOverlap.title': '{a} and {b} may overlap in triggers',
  'finding.triggerOverlap.detail':
    'Similarity {score}% (cosine {cosine}%, Jaccard {jaccard}%). Shared terms: {shared}',
  'finding.triggerOverlap.detailNoShared':
    'Similarity {score}% (cosine {cosine}%, Jaccard {jaccard}%). No clearly shared terms.',
  'finding.triggerOverlap.suggestion':
    'Consider adding mutually exclusive “Not for …” boundaries, or merging their responsibilities.',
  'finding.negativeContradiction.title': '{a} excludes exactly what triggers {b}',
  'finding.negativeContradiction.detail':
    '“{term}” appears both in {a} negative triggers and {b} positive triggers.',
  'finding.negativeContradiction.suggestion':
    'Check whether the boundaries conflict and clarify the split in the descriptions.',
  'finding.duplicateContent.title': '{a} and {b} have highly duplicated bodies',
  'finding.duplicateContent.detail':
    'Body similarity {score}%; one may be an outdated copy of the other.',
  'finding.duplicateContent.suggestion':
    'Decide whether both are needed, or merge them and have one reference the other.',
};
