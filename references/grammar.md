# The grammar of ALP values

Read this only when a word of the user is not in the vocabulary and you build a value yourself. Values built by these rules are the ones every agent arrives at, so they either match a site now or are counted as demand for later (spec 0.0.0.04, § 9.7.5).

## Paths

Lower-case segments of `a-z`, `0-9` and inner hyphens, joined by `/`, at most six: `travel/lodging/villa`, `us/mt/bozeman`. A value covers everything below it: `travel/lodging` finds villas, hotels and hostels.

## object: what it is

The first segment is one of twelve fixed top levels:

| Top level | For example |
|---|---|
| `travel` | `travel/lodging/villa`, `travel/lodging/hotel`, `travel/lodging/guesthouse`, `travel/lodging/hostel`, `travel/attraction`, `travel/agency` |
| `retail` | `retail/clothing`, `retail/clothing/outerwear/fur-coat`, `retail/electronics`, `retail/books`, `retail/grocery` |
| `food` | `food/restaurant`, `food/restaurant/fast-food`, `food/cafe`, `food/bakery`, `food/bar` |
| `service` | `service/legal`, `service/beauty/hair`, `service/automotive/repair`, `service/fitness/gym` |
| `health` | `health/dentist`, `health/clinic`, `health/pharmacy` |
| `education` | `education/school`, `education/university` |
| `culture` | `culture/museum`, `culture/cinema`, `culture/theater` |
| `information` | `information/news`, `information/blog`, `information/video/tutorial` |
| `organization` | `organization/ngo`, `organization/government` |
| `event` | `event/music`, `event/festival` |
| `personal` | a person's own site |
| `achievement` | records and titles a site claims |

Leaves follow the types of schema.org in lower case with hyphens: `FastFoodRestaurant` is `food/restaurant/fast-food`, `ClothingStore` is `retail/clothing`. When unsure, ask one level up.

## geo: where it is

`<country>/<region>/<locality>`, as far as you know:

- country: the two-letter ISO 3166-1 code, `us`, `id`, `ru`, `gb`;
- region: in the US the state code, `us/mt`; elsewhere the English name as a path, `id/bali`, `ru/saint-petersburg`, `ru/moscow-oblast`;
- locality: the English or transliterated name, `us/mt/bozeman`, `id/bali/ubud`.

A city that is its own region is written once: `ru/saint-petersburg`, `ru/moscow`, `sg/singapore`.

## Facets

`cuisine` (`burger`, `italian`, `pizza`), `amenity` (`wifi`, `pool`, `kitchen`, `breakfast`, `workspace`), `setting` (`jungle`, `rice-field`, `beach`), `language` (ISO 639-1, `en`, `ru`), `price_tier` (`budget`, `mid`, `premium`, `luxury`).

## Numeric axes

`price` is asked with a range, never with a value: `--price-max 100 --unit USD --per night`. Units are ISO 4217 codes; `per` is `item`, `night`, `hour`, `month` or `year`. By default a site matches when some of its prices fall in the range; `--within` asks that all of them do.
