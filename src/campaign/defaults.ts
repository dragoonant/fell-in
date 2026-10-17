// The default CampaignData: the shipped edition bundle (src/data, bundled by Vite). Tests pass their own CampaignData instead.
import { campaignBundle } from '../data/campaign-loader'
import { campaignData, type CampaignData } from './data'

let cached: CampaignData | null = null
export function defaultCampaignData(): CampaignData {
  cached ??= campaignData(campaignBundle())
  return cached
}
