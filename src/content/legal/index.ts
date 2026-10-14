/*
 * Bundled Terms and Conditions and Privacy Policy for Kariba Lake Connect.
 *
 * The /terms and /privacy pages show the current published version from
 * legal_documents (doc_type 'terms' / 'privacy') when there is one, and these
 * bundled drafts otherwise. supabase/migrations/34_publish_terms_privacy.sql
 * publishes exactly these bodies; regenerate it with
 * `node scripts/build-legal-migration.mjs` after editing either .md file.
 *
 * DRAFTS: both documents must be reviewed by a legal practitioner registered in
 * Zimbabwe before they are published.
 *
 * Sources checked (October 2026). Section numbers below were read from the
 * gazetted texts; points marked "secondary" were not confirmed in a primary text.
 *
 * Cyber and Data Protection Act [Chapter 12:07], No. 5 of 2021 (in force 11 March 2022)
 *   https://www.veritaszim.net/sites/veritas_d/files/Cyber%20%26%20Data%20Protection%20Act%20Cap1207%20No%205%20of%202021%20gaz%202022-03-11.pdf
 *   https://zimlii.org/akn/zw/act/2021/5/eng@2022-03-11
 *   s.3   definitions: "child" (under 18), "consent", "sensitive data", "personal information"
 *   s.5   POTRAZ designated as the Data Protection Authority
 *   s.6(1)(g),(h) the Authority receives and investigates complaints
 *   s.7   data adequate, accurate, kept no longer than necessary
 *   s.8-9 processing necessary, fair and lawful; specified, explicit, legitimate purposes
 *   s.10  consent (implied for adults); without consent where needed for a legal
 *         obligation, vital interests, public interest or legitimate interests
 *   s.11  sensitive data only with written consent, withdrawable free of charge
 *   s.12  genetic, biometric and health data: written consent
 *   s.13  duties of controllers (lawful, fair, transparent, minimal, accurate, limited retention)
 *   s.14  rights: be informed, access, object, correct false or misleading data,
 *         delete false or misleading data
 *   s.15  information to give when collecting data directly
 *   s.18  security; written contract with processors (s.18(5))
 *   s.19  notify the Authority within 24 hours of a security breach
 *   s.20(5) the DPO's appointment must be notified to the Authority
 *   s.25  right not to be subject to solely automated decisions with legal effect
 *   s.26  a child's rights are exercised by a parent or guardian
 *   s.28  transfers abroad only with an adequate level of protection, and solely
 *         for tasks within the controller's competence
 *   s.29  exceptions where protection is not adequate: consent, performance of a
 *         contract with the data subject, legal claims, vital interests, and others
 *
 * Cyber and Data Protection (Licensing of Data Controllers and Appointment of Data
 * Protection Officers) Regulations, 2024 (SI 155 of 2024)
 *   https://techzim.co.zw/wp-content/uploads/2024/11/S.I.-155-of-2024.-Cyber-and-Data-Protection-13sept2024.pdf
 *   https://www.afriwise.com/blog/understanding-si-155-of-2024-new-regulations-on-data-protection-licensing-and-data-protection-officers-in-zimbabwe (secondary)
 *   s.3-4 anyone who decides the purpose and means of processing must hold a
 *         data controller licence (Form DP1); existing controllers had 6 months
 *   s.5   licence valid 12 months; renew at least 3 months before expiry
 *   s.6   tiers by number of data subjects: 1 (50-1,000), 2 (1,001-100,000),
 *         3 (100,001-500,000), 4 (over 500,000)
 *   Second Schedule fees, USD or ZiG: application fee USD 30 (tiers 2-4);
 *         initial or renewal licence fee USD 50 / 300 / 500 / 2,500 for tiers
 *         1 / 2 / 3 / 4; DPO certification USD 1,250 per Zimbabwean citizen
 *   s.10(2)(c) notify the Authority of any intention to transfer data outside Zimbabwe
 *   s.10(4)(f) written data processing agreement with every processor
 *   s.10(5) children's data only with a parent's or guardian's consent
 *   s.12  appoint a DPO and notify the Authority on Form DP2, within 90 days
 *   s.13  the DPO must complete a POTRAZ-approved certification course
 *   s.16  technical and organisational security measures
 *   s.17  report breaches to the Authority within 24 hours (Form DP3); tell data
 *         subjects within 72 hours where there is a high risk; keep a breach record
 *   No rule requiring a published privacy notice was found in SI 155; the duty to
 *   inform comes from s.15 of the Act.
 *   POTRAZ contact details are those printed on Forms DP1 and DP2.
 *
 * Consumer Protection Act [Chapter 14:44], No. 5 of 2019
 *   https://commons.laws.africa/akn/zw/act/2019/5/media/publication/zw-act-2019-5-publication-document.pdf
 *   https://zimlii.org/akn/zw/act/2019/5
 *   s.20  right to cancel an advance booking; supplier may take a reasonable
 *         deposit and charge a reasonable cancellation fee; no fee on death or
 *         hospitalisation of the person or an immediate family member
 *   s.27  duties of intermediaries
 *   s.40  over-booking: refund where the supplier cannot provide the service
 *   s.41  unfair, unreasonable and unjust terms
 *   s.42  no disclaimer of consumer rights; "no refund" clauses are unfair
 *   s.43  terms limiting liability or assuming risk must be in plain language and
 *         drawn to the consumer's attention conspicuously before the transaction
 *   s.52  information a supplier must make available online (identity, address,
 *         registration, full price, payment method, refund policy, privacy policy)
 *   s.53  7-day cooling-off for electronic transactions; full refund within 14 days
 *   s.54  unsolicited electronic communications: opt-out
 *   s.55  the Consumer Council of Zimbabwe and other designated organisations conciliate disputes
 *
 * Electronic transactions
 *   The Electronic Transactions and Electronic Commerce Bill was approved in
 *   principle by Cabinet in 2021; no source confirming it was enacted or brought
 *   into force was found. Online consumer transactions are covered by Part IV
 *   (ss.52-54) of the Consumer Protection Act.
 *   https://techzim.co.zw/2021/09/cabinet-approves-ecommerce-bill
 *
 * Records retention
 *   ZIMRA: records must be kept for a minimum of six years (Income Tax Act
 *   [Chapter 23:06] s.37B, VAT Act [Chapter 23:12] s.57, Customs and Excise Act
 *   [Chapter 23:02] s.223), as stated by ZIMRA; the statutory wording itself was
 *   not read.
 *   https://www.zimra.co.zw/domestic-taxes/corporate/record-keeping-explained
 *
 * Boating on Lake Kariba
 *   The Inland Waters Shipping Act is the governing statute and the Department of
 *   Inland Waters issues vessel permits (news reports; the Act's text was not read).
 *   https://www.heraldonline.co.zw/lake-karibas-replacement-ferry-fails-first-safety-inspection/
 */

import termsBody from './terms.md?raw';
import privacyBody from './privacy.md?raw';

export type BundledLegalDocType = 'terms' | 'privacy';

export interface BundledLegalDocument {
  docType: BundledLegalDocType;
  title: string;
  /** The version migration 34 publishes this text as (the live documents are version 1). */
  version: number;
  /** Markdown, in the subset LegalMarkdown renders. */
  body: string;
}

export const bundledLegalDocuments: Record<BundledLegalDocType, BundledLegalDocument> = {
  terms: { docType: 'terms', title: 'Terms and Conditions', version: 2, body: termsBody },
  privacy: { docType: 'privacy', title: 'Privacy Policy', version: 2, body: privacyBody },
};
