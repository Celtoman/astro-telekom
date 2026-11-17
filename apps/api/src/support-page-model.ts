import type { GeneralHomeFieldRule } from './general-home-model';
import type { SupportImage } from './support-image-model';
export const SUPPORT_PAGE_SLUG = 'tehpodderzhka';
export const SUPPORT_PAGE_VERSION = '1.0.0';
export const SUPPORT_SECTION_ORDER = ["hero", "quickLinks", "introduction", "address", "phones", "callback", "chat", "social", "account", "app", "capabilities", "business", "faq"] as const;
export type SupportSection = typeof SUPPORT_SECTION_ORDER[number];
export type SupportPageContent = {
    version: string;
    hero: {
        h1: string;
        intro: string;
        connection: {
            title: string;
            audience: string;
            topics: {
                one: string;
                two: string;
                three: string;
            };
            label: string;
        };
        support: {
            title: string;
            audience: string;
            topics: {
                one: string;
                two: string;
                three: string;
            };
            label: string;
            freeCall: string;
        };
    };
    quickLinks: {
        hotline: string;
        cityPhones: string;
        callback: string;
        chat: string;
        social: string;
        account: string;
        app: string;
    };
    introduction: {
        first: string;
        second: string;
        image: SupportImage;
    };
    address: {};
    phones: {
        title: string;
        hotlineTitle: string;
        numberIntro: string;
        numberNote: string;
        connectionTitle: string;
        connectionBody: string;
        skipMenu: string;
        helpTitle: string;
        helpBody: string;
        newConnection: {
            title: string;
            body: string;
        };
        cityTitle: string;
        cityIntro: string;
        official: {
            title: string;
            body: string;
        };
        account: {
            title: string;
            body: string;
        };
        cost: {
            title: string;
            body: string;
        };
        image: SupportImage;
        zoomCaption: string;
        exampleNote: string;
    };
    callback: {
        title: string;
        intro: string;
        steps: {
            step1: string;
            step2: string;
            step3: string;
        };
        explanation: string;
        appNote: string;
        menu: SupportImage;
        form: SupportImage;
    };
    chat: {
        title: string;
        intro: string;
        entryText: string;
        entry: SupportImage;
        dialogue: string;
        image: SupportImage;
    };
    social: {
        title: string;
        intro: string;
        vk: {
            title: string;
            body: string;
            label: string;
            href: string;
        };
        newsTitle: string;
        ok: {
            title: string;
            body: string;
            label: string;
            href: string;
        };
        telegram: {
            title: string;
            body: string;
            label: string;
            href: string;
        };
        image: SupportImage;
    };
    account: {
        title: string;
        intro: string;
        instruction: string;
        steps: {
            step1: string;
            step2: string;
            step3: string;
            step4: string;
        };
        image: SupportImage;
    };
    app: {
        title: string;
        intro: string;
        body: string;
        image: SupportImage;
        stores: {
            googlePlay: string;
            ruStore: string;
            appGallery: string;
        };
    };
    capabilities: {
        title: string;
        remoteTitle: string;
        remoteIntro: string;
        consent: string;
        stepsTitle: string;
        steps: {
            step1: string;
            step2: string;
            step3: string;
            step4: string;
            step5: string;
            step6: string;
            step7: string;
        };
        competenceTitle: string;
        training: {
            title: string;
            body: string;
        };
        approach: {
            title: string;
            body: string;
        };
        limitsTitle: string;
        limitsIntro: string;
        limits: {
            data: {
                title: string;
                body: string;
            };
            software: {
                title: string;
                body: string;
            };
            hardware: {
                title: string;
                body: string;
            };
            security: {
                title: string;
                body: string;
            };
        };
        note: string;
    };
    business: {
        title: string;
        intro: string;
        body: string;
        note: string;
        image: SupportImage;
    };
    faq: {
        title: string;
        items: Array<{
            question: string;
            answer: string;
        }>;
    };
};
export const SUPPORT_PAGE_SCHEMA: GeneralHomeFieldRule = {
    "kind": "object",
    "fields": {
        "version": {
            "kind": "text",
            "limit": 20000,
            "variables": false
        },
        "hero": {
            "kind": "object",
            "fields": {
                "h1": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "intro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "connection": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "audience": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "topics": {
                            "kind": "object",
                            "fields": {
                                "one": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                },
                                "two": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                },
                                "three": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                }
                            }
                        },
                        "label": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                },
                "support": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "audience": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "topics": {
                            "kind": "object",
                            "fields": {
                                "one": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                },
                                "two": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                },
                                "three": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                }
                            }
                        },
                        "label": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "freeCall": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                }
            }
        },
        "quickLinks": {
            "kind": "object",
            "fields": {
                "hotline": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "cityPhones": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "callback": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "chat": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "social": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "account": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "app": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                }
            }
        },
        "introduction": {
            "kind": "object",
            "fields": {
                "first": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "second": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "image": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                }
            }
        },
        "address": {
            "kind": "object",
            "fields": {}
        },
        "phones": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "hotlineTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "numberIntro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "numberNote": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "connectionTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "connectionBody": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "skipMenu": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "helpTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "helpBody": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "newConnection": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "cityTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "cityIntro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "official": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "account": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "cost": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "image": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                },
                "zoomCaption": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "exampleNote": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                }
            }
        },
        "callback": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "intro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "steps": {
                    "kind": "object",
                    "fields": {
                        "step1": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step2": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step3": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "explanation": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "appNote": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "menu": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                },
                "form": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                }
            }
        },
        "chat": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "intro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "entryText": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "entry": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                },
                "dialogue": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "image": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                }
            }
        },
        "social": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "intro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "vk": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "label": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "href": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "newsTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "ok": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "label": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "href": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "telegram": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "label": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "href": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "image": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                }
            }
        },
        "account": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "intro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "instruction": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "steps": {
                    "kind": "object",
                    "fields": {
                        "step1": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step2": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step3": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step4": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "image": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                }
            }
        },
        "app": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "intro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "body": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "image": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                },
                "stores": {
                    "kind": "object",
                    "fields": {
                        "googlePlay": {
                            "kind": "text",
                            "limit": 2048,
                            "variables": false
                        },
                        "ruStore": {
                            "kind": "text",
                            "limit": 2048,
                            "variables": false
                        },
                        "appGallery": {
                            "kind": "text",
                            "limit": 2048,
                            "variables": false
                        }
                    }
                }
            }
        },
        "capabilities": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "remoteTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "remoteIntro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "consent": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "stepsTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "steps": {
                    "kind": "object",
                    "fields": {
                        "step1": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step2": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step3": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step4": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step5": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step6": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        },
                        "step7": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "competenceTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "training": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "approach": {
                    "kind": "object",
                    "fields": {
                        "title": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "body": {
                            "kind": "text",
                            "limit": 20000,
                            "variables": true
                        }
                    }
                },
                "limitsTitle": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "limitsIntro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "limits": {
                    "kind": "object",
                    "fields": {
                        "data": {
                            "kind": "object",
                            "fields": {
                                "title": {
                                    "kind": "text",
                                    "limit": 500,
                                    "variables": true
                                },
                                "body": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                }
                            }
                        },
                        "software": {
                            "kind": "object",
                            "fields": {
                                "title": {
                                    "kind": "text",
                                    "limit": 500,
                                    "variables": true
                                },
                                "body": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                }
                            }
                        },
                        "hardware": {
                            "kind": "object",
                            "fields": {
                                "title": {
                                    "kind": "text",
                                    "limit": 500,
                                    "variables": true
                                },
                                "body": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                }
                            }
                        },
                        "security": {
                            "kind": "object",
                            "fields": {
                                "title": {
                                    "kind": "text",
                                    "limit": 500,
                                    "variables": true
                                },
                                "body": {
                                    "kind": "text",
                                    "limit": 20000,
                                    "variables": true
                                }
                            }
                        }
                    }
                },
                "note": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                }
            }
        },
        "business": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "intro": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "body": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "note": {
                    "kind": "text",
                    "limit": 20000,
                    "variables": true
                },
                "image": {
                    "kind": "object",
                    "fields": {
                        "src": {
                            "kind": "asset",
                            "limit": 2048,
                            "variables": false
                        },
                        "alt": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        },
                        "caption": {
                            "kind": "text",
                            "limit": 500,
                            "variables": true
                        }
                    }
                }
            }
        },
        "faq": {
            "kind": "object",
            "fields": {
                "title": {
                    "kind": "text",
                    "limit": 500,
                    "variables": true
                },
                "items": {
                    "kind": "list",
                    "min": 1,
                    "max": 50,
                    "item": {
                        "kind": "object",
                        "fields": {
                            "question": {
                                "kind": "text",
                                "limit": 20000,
                                "variables": true
                            },
                            "answer": {
                                "kind": "text",
                                "limit": 20000,
                                "variables": true
                            }
                        }
                    }
                }
            }
        }
    }
};
export const SUPPORT_SECTION_LABELS = { hero:'Первый экран',quickLinks:'Быстрые ссылки',introduction:'Введение',address:'Проверка подключения',phones:'Телефоны Дом.ру',callback:'Обратный звонок на официальном сайте',chat:'Чат на официальном сайте',social:'Поддержка и сообщества',account:'Личный кабинет',app:'Приложение',capabilities:'Как работает поддержка',business:'Поддержка бизнеса',faq:'Популярные вопросы' } as const;
export function supportEditableField(path: unknown): path is string {
  if (typeof path !== 'string' || path === 'version' || path.endsWith('.field')) return false;
  if(/^(introduction\.image|phones\.image|callback\.(menu|form)|chat\.(entry|image)|social\.image|account\.image|app\.image|business\.image)\.(crop|assetId)$/.test(path))return true;
  let rule = SUPPORT_PAGE_SCHEMA;
  for (const part of path.split('.')) {
    if (rule.kind === 'object') { if (!Object.hasOwn(rule.fields,part)) return false; rule=rule.fields[part]; }
    else if (rule.kind === 'list' && /^(0|[1-9]\d*)$/.test(part) && Number(part)<rule.max) rule=rule.item;
    else return false;
  }
  return rule.kind==='text' || rule.kind==='asset' || path==='faq.items';
}
export function supportFieldLabel(path: string): string {
  const labels:Record<string,string>={callback:'Обратный звонок',chat:'Онлайн-чат',social:'Соцсети',account:'Личный кабинет',app:'Приложение',h1:'Заголовок страницы',intro:'Введение',title:'Заголовок',first:'Первый абзац',second:'Второй абзац',image:'Изображение',src:'Источник файла',alt:'Описание изображения',caption:'Подпись',body:'Текст',label:'Подпись ссылки',href:'Назначение ссылки',steps:'Шаги',instruction:'Перед инструкцией',question:'Вопрос',answer:'Ответ',items:'Вопросы и ответы',connection:'Подключение',support:'Поддержка',audience:'Аудитория',topics:'Темы обращения',one:'Первая тема',two:'Вторая тема',three:'Третья тема',freeCall:'Стоимость звонка',hotline:'Горячая линия',cityPhones:'Городские телефоны',numberIntro:'Текст перед номером',numberNote:'Пояснение под номером',hotlineTitle:'Название горячей линии',connectionTitle:'Связь со специалистом: заголовок',connectionBody:'Связь со специалистом: текст',skipMenu:'Пропуск голосового меню',helpTitle:'Заголовок помощи',helpBody:'С чем помогает поддержка',newConnection:'Новое подключение',cityTitle:'Заголовок городских номеров',cityIntro:'Введение в городские номера',official:'Официальный сайт',cost:'Оплата звонка',zoomCaption:'Подпись увеличения номера',exampleNote:'Пример Казани',explanation:'Пояснение после шагов',appNote:'Примечание о приложении',menu:'Меню',form:'Форма обратного звонка',entryText:'Как открыть чат',entry:'Кнопка чата',dialogue:'Текст о диалоге',vk:'ВКонтакте',ok:'Одноклассники',telegram:'Telegram',newsTitle:'Заголовок сообществ',stores:'Магазины приложений',googlePlay:'Google Play',ruStore:'RuStore',appGallery:'AppGallery',remoteTitle:'Заголовок удалённой помощи',remoteIntro:'Удалённая помощь',consent:'Согласие на доступ',stepsTitle:'Заголовок инструкции',competenceTitle:'Заголовок компетентности',training:'Подготовка',approach:'Подход',limitsTitle:'Заголовок ограничений',limitsIntro:'Введение в ограничения',limits:'Ограничения',data:'Данные',software:'Стороннее ПО',hardware:'Оборудование',security:'Безопасность',note:'Примечание',placeholder:'Подсказка поля',button:'Кнопка',illustrationCaption:'Подпись иллюстрации'};
  return path.split('.').map((p,i)=>i===0 ? SUPPORT_SECTION_LABELS[p as keyof typeof SUPPORT_SECTION_LABELS]??p : /^step\d+$/.test(p) ? 'Шаг '+p.slice(4) : /^\d+$/.test(p) ? String(Number(p)+1) : labels[p]??p).join(': ');
}
