// Vite loader for the campaign data (M6): bundles data/<edition>/campaign/*.json at build time. Node tools read the
// same files from disk through tools/validate-data.ts and use the pure helpers in campaign.ts instead.
import { defaultEdition, edition } from './index'
import type { RawFile } from './bundle'
import { campaignIndex, campaignRecords, splitCampaign, withCampaign, type CampaignBundle, type CampaignFiles } from './campaign'
import type { CampaignRecords } from './campaign-types'

const modules = import.meta.glob('../../data/*/campaign/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const PREFIX = '../../data/'
const raw: RawFile[] = Object.entries(modules).map(([p, json]) => ({ path: p.slice(PREFIX.length), json }))
const { byEdition } = splitCampaign(raw)

/** The campaign files of an edition (default when omitted); an edition with none reads as empty. */
export function campaignFiles(ed: string = defaultEdition): CampaignFiles { return byEdition[ed] ?? {} }
/** All campaign records of an edition. */
export function campaign(ed: string = defaultEdition): CampaignRecords { return campaignRecords(campaignFiles(ed)) }
/** Id lookups over the edition's campaign records. */
export function campaignLookup(ed: string = defaultEdition) { return campaignIndex(campaign(ed)) }
/** The edition bundle with `records.perks` and `records.campaign` filled, for src/campaign/data.ts campaignData(). */
export function campaignBundle(ed: string = defaultEdition): CampaignBundle { return withCampaign(edition(ed), campaignFiles(ed)) }
